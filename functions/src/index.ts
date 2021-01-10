import * as functions from "firebase-functions";
import cors = require("cors");
import express = require("express");
import * as admin from "firebase-admin";
import { ERROR_401, ERROR_CLASS_REQUEST, ERROR_THREAD_REQUEST } from "./errors";
import { ClassData, NewClassData, NewThreadData, ThreadData } from "./types";
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
          //If the query finds one pre-existing user doc with that email (Added to a class before they logged in)
          // Because they already have classes assigned, rosters and classes will have to be hydrated with data
          const userDoc = snapshot.docs[0];
          userDoc.ref
            .set(userInfo)
            .then()
            .catch((err) => {
              throw err;
            });
        } else {
          //Otherwise, create a new document with their info. Since they haven't been added to other classes, this is all that needs to be done here.
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
  const { name, section, description, participants } = data as NewClassData;
  const db = admin.firestore();
  const batch = db.batch();

  const participants_lc = participants?.map((p) => p.toLowerCase()) || [];
  participants_lc?.unshift(ctx.auth.token.email.toLowerCase()); //Adds the teacher's email to the participants
  const participants_added: string[] = [];
  const classRef = db.collection("classes").doc();
  //@ts-ignore
  const channelsRef = classRef.collection("threads");
  const rosterRef = db.collection("rosters").doc();

  //Updates existing user profiles
  const userDocs = (
    await db.collection("users").where("email", "in", participants_lc).get()
  ).docs;
  userDocs.forEach((user) => {
    participants_added.push(user.get("email"));
    batch.set(
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
      const newUser = db.collection("users").doc();
      batch.create(newUser, {
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
  const c = {
    name,
    section,
    description,
    tags: [],
    participants: participants_lc,
    roster: rosterRef.id,
  };
  batch.create(classRef, c);
  //Create a new roster document with each participant's email
  batch.create(rosterRef, {
    class: classRef.id,
    participants: participants_lc,
  });

  return batch
    .commit()
    .then(() => c)
    .catch((err) => err);
});

/**
 * When a user creates a thread, does the following:
 * 1. Checks if the necessary thread info
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
  const t = <NewThreadData>data;
  const classRef = admin.firestore().collection("classes").doc(data.classId);
  try {
    const c = await classRef.get().then((res) => res.data()! as ClassData);
    const userInClass = c.participants?.includes(
      ctx.auth.token.email.toLowerCase()
    );
    const validTags =
      c.tags?.filter((tag) => !c.tags?.includes(tag)).length === 0;
    if (!userInClass) throw ERROR_401;
    else if (t.tags && validTags) throw ERROR_THREAD_REQUEST;
    else {
      // NEED TO ADD ANONYMOUS STUFF
      const threadRef = classRef.collection("threads").doc();
      const thread: ThreadData = {
        ...t,
        className: c.name,
        email: ctx.auth.token.email,
        id: threadRef.id,
        status: {
          isClosed: false,
          isResolved: false,
          numMessages: 0,
        },
        created: admin.firestore.Timestamp.now(),
      };
      threadRef
        .create(thread)
        .then()
        .catch((err) => {
          throw err;
        });
      return thread;
    }
  } catch (err) {
    return err;
  }
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
