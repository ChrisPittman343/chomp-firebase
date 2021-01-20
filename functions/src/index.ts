import * as functions from "firebase-functions";
import cors = require("cors");
import express = require("express");
import * as admin from "firebase-admin";
import {
  ERROR_401,
  ERROR_CLASS_REQUEST,
  ERROR_EMPTY_RESPONSE,
  ERROR_MESSAGE_REQUEST,
  ERROR_THREAD_REQUEST,
} from "./errors";
import {
  ClassData,
  MessageData,
  NewClassData,
  NewMessageData,
  NewThreadData,
  ThreadData,
} from "./types";
import {
  getAuthClient,
  getClassroomClient,
  getCourses,
  getStudents,
} from "./oAuthFunctions";
import { verifyBasicAuth } from "./verifyRequest";

admin.initializeApp();

//#region Express
const app = express();
app.use(cors({ origin: true, methods: ["GET", "POST"] }));

app.post("/get-classes", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const idToken = req.header("Authorization");
  const accessToken = req.header("Access-Token");
  if (!idToken || !accessToken) res.send(ERROR_401);
  verifyBasicAuth(req, res)
    .then()
    .catch((err) => res.send(ERROR_401));
  const authClient = getAuthClient(accessToken!);
  const classroom = getClassroomClient(authClient);
  const coursesData = await getCourses(classroom);
  const studentsData = await getStudents(classroom, coursesData!);
  if (!coursesData || !studentsData) {
    res.status(401).send(ERROR_401);
  }
  //@ts-ignore
  const classData = parseCourseData(coursesData, studentsData);
  res.send(classData);
});

exports.widgets = functions.https.onRequest(app);
//#endregion

export const onNewUser = functions.auth.user().onCreate((user, ctx) => {
  const db = admin.firestore();
  const userInfo = {
    name: user.displayName!,
    uid: user.uid,
    email: user.email!.toLowerCase(),
    photoURL: user.photoURL,
  };
  try {
    db.collection("users")
      .where("email", "==", user.email)
      .get()
      .then((snapshot) => {
        if (snapshot.docs.length === 1 && snapshot.docs[0].exists) {
          const userDoc = snapshot.docs[0];
          userDoc.ref
            .set(userInfo)
            .then()
            .catch((err) => {
              throw err;
            });
        } else {
          db.collection("users")
            .doc()
            .create(userInfo)
            .then()
            .catch((err) => {
              throw err;
            });
        }
      })
      .catch((err) => {
        throw err;
      });
  } catch (err) {
    return err;
  }
});

/**
 * When a user creates a class, does the following:
 * 1. Checks if the class has valid info
 * 2. Updates user profiles with basic class info
 * 3. Creates a new class instance
 * 4. Creates a new roster instance
 * @returns The class data that was sent, or an error
 */
export const createClass = functions.https.onCall(async (data, ctx) => {
  if (!ctx.auth || !ctx.auth.token.email) return ERROR_401;
  if (!data.name || (data.participants && data.participants.length > 40))
    return ERROR_CLASS_REQUEST;
  const db = admin.firestore();
  try {
    const { name, section, description, participants } = data as NewClassData;
    const participants_lc = participants?.map((p) => p.toLowerCase()) || []; // Also need to filter for dupes
    participants_lc?.unshift(ctx.auth.token.email.toLowerCase()); //Adds the teacher's email to the participants
    const participants_added: string[] = [];
    const classRef = db.collection("classes").doc();
    const rosterRef = db.collection("rosters").doc(classRef.id);
    const usersRef = db
      .collection("users")
      .where("email", "in", participants_lc);

    return await db.runTransaction(async (t) => {
      //Updates existing user profiles
      (await t.get(usersRef)).docs.forEach((user) => {
        participants_added.push(user.get("email"));
        t.set(
          user.ref,
          {
            classes: admin.firestore.FieldValue.arrayUnion({
              id: classRef.id,
              name,
              section,
              description,
            }),
          },
          { merge: true }
        );
      });

      //Create new user profiles if not already added
      participants_lc?.forEach((email) => {
        if (participants_added.indexOf(email) === -1) {
          const newUserRef = db.collection("users").doc();
          t.create(newUserRef, {
            email,
            classes: admin.firestore.FieldValue.arrayUnion({
              id: classRef.id,
              name,
              section,
              description,
            }),
          });
        }
      });

      //Create a new class document with the basic info + participants
      const c: ClassData = {
        name,
        id: classRef.id,
        section,
        description,
        tags: [],
        participants: participants_lc,
        roster: rosterRef.id,
      };
      t.create(classRef, c);

      //Create a new roster document with each participant's email
      t.create(rosterRef, {
        classId: classRef.id,
        participants: participants_lc,
      });

      return c;
    });
  } catch (e) {
    console.log("Create class failure:", e);
    return e;
  }
});

/**
 * When a user creates a thread, does the following:
 * 1. Checks if the necessary thread info exists
 * 2. Checks if classId and tags are valid
 * 3. Adds a new thread instance to the specified class
 * **Storing thread info on a user might also be a good idea (So they can see what questions they asked)**
 * @returns The thread data that was sent, or an error
 */
export const createThread = functions.https.onCall(async (data, ctx) => {
  if (!ctx.auth || !ctx.auth.token.email) return ERROR_401;
  if (
    !data.title ||
    !data.classId ||
    data.title.length > 300 ||
    data.message?.length > 1500
  )
    return ERROR_THREAD_REQUEST;
  const db = admin.firestore();

  try {
    const threadInput = <NewThreadData>data;
    const classRef = db.collection("classes").doc(data.classId);
    const threadRef = db.collection("threads").doc();
    return await db.runTransaction(async (t) => {
      // Initial auth checks
      const c = (await classRef.get()).data() as ClassData | undefined;
      if (!c) throw ERROR_EMPTY_RESPONSE;
      if (!c.participants?.includes(ctx.auth!.token.email!.toLowerCase()))
        throw ERROR_401;

      // Tag validity check
      const validTags =
        c.tags?.filter((tag) => !c.tags?.includes(tag)).length === 0;
      if (threadInput.tags && threadInput.tags.length > 0 && !validTags)
        throw ERROR_THREAD_REQUEST;

      // Creating new thread doc
      const thread: ThreadData = {
        ...threadInput,
        className: c.name,
        email: ctx.auth!.token.email!,
        id: threadRef.id,
        isClosed: false,
        numMessages: 0,
        score: 0,
        created: admin.firestore.Timestamp.now(),
      };
      t.create(threadRef, thread);
      return thread;
    });
  } catch (e) {
    console.log("Create thread failure:", e);
    return e;
  }
});

/**
 * When a user creates a message, does the following:
 * 1. Checks if the necessary thread info
 * 2. Checks if classId, threadId, and parentId are valid
 * 3. Adds a new thread instance to the specified class
 * **Storing thread info on a user might also be a good idea (So they can see what questions they asked)**
 * @returns The thread data that was sent, or an error
 */
export const createMessage = functions.https.onCall(async (data, ctx) => {
  if (!ctx.auth || !ctx.auth.token.email) return ERROR_401;
  if (
    !data.classId ||
    !data.threadId ||
    !data.parentId ||
    data.message?.length > 2000
  )
    return ERROR_MESSAGE_REQUEST;
  const db = admin.firestore();
  try {
    const m = data as NewMessageData;
    const classRef = db.collection("classes").doc(m.classId);
    const threadRef = db.collection("threads").doc(m.threadId);
    const messageRef = db.collection("messages").doc();
    return await db.runTransaction(async (t) => {
      // Initial auth checks
      const c = (await classRef.get()).data() as ClassData | undefined;
      if (!c) throw ERROR_EMPTY_RESPONSE;
      if (!c.participants?.includes(ctx.auth!.token.email!.toLowerCase()))
        throw ERROR_401;

      // Updating the thread's message count
      t.set(
        threadRef,
        {
          numMessages: admin.firestore.FieldValue.increment(1),
        },
        { merge: true }
      );

      // Creating a new message doc
      const newMessage: MessageData = {
        id: messageRef.id,
        classId: m.classId,
        threadId: m.threadId,
        parentId: m.parentId,
        email: ctx.auth!.token.email!.toLowerCase(),
        message: m.message,
        score: 0,
        sent: admin.firestore.Timestamp.now(),
      };
      t.create(messageRef, newMessage);
      return newMessage;
    });
  } catch (e) {
    console.log("Create message failure:", e);
    return e;
  }
});

/**
 * Occurs when a user changes their vote on a thread
 */
export const onThreadVote = functions.firestore
  .document("/threadVotes/{threadVoteId}")
  .onUpdate((change, ctx) => {
    // Don't need to check user auth because if it made it here, then they already are authorized to make the request
  });

/**
 * Occurs when a user changes their vote on a message
 */
export const onMessageVote = functions.firestore
  .document("/threadVotes/{threadVoteId}")
  .onUpdate((change, ctx) => {
    // Don't need to check user auth because if it made it here, then they already are authorized to make the request
  });

/**
 * Every day, clean out empty user profiles from the users, classes, and rosters collections
 * Ideally, do so in the order of roster, classes, then users, so you know the important data before
 */
export const purgeEmptyUsers = functions.pubsub
  .schedule("every 1 day")
  .onRun(async (context) => {
    const db = admin.firestore();

    const users = await db
      .collection("users")
      .where("uid", "==", "")
      .get()
      .then((snapshot) => snapshot.docs)
      .catch((err) => {
        throw err;
      });
    users.forEach((user) => {
      //const email = user.get("email");
    });
  });

//Should probably clear out empty / inactive classes, too.
