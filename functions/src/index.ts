import * as functions from "firebase-functions";
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
  Vote,
} from "./types";
import {
  getAuthClient,
  getClassroomClient,
  getCourses,
  getStudents,
  parseCourseData,
} from "./oAuthFunctions";
import { findVotesDiff } from "./findVotesDiff";

admin.initializeApp();

export const onNewUser = functions.auth.user().onCreate(async (user, ctx) => {
  const db = admin.firestore();

  try {
    const userQuery = db.collection("users").where("email", "==", user.email);
    await db.runTransaction(async (t) => {
      const userInfo = {
        name: user.displayName!,
        uid: user.uid,
        email: user.email!.toLowerCase(),
        created: admin.firestore.Timestamp.now(),
      };
      const userDocs = await t.get(userQuery);
      // Checks to see if a user doc already exists (Due to them being added to a class)
      if (userDocs.docs.length === 1 && userDocs.docs[0].exists) {
        const userDoc = userDocs.docs[0];
        t.set(userDoc.ref, userInfo, { merge: true });
      }
      // If there's no doc, create one
      else if (userDocs.docs.length === 0) {
        const newUserRef = db.collection("users").doc();
        t.create(newUserRef, userInfo);
      } else {
        throw ERROR_401;
      }
    });
  } catch (err) {
    return err;
  }
});

export const fetchClassroomClasses = functions.https.onCall(
  async (data, ctx) => {
    if (!ctx.auth || !ctx.auth.token.email || !data.accessToken)
      return ERROR_401;
    try {
      const accessToken = data.accessToken;
      // Getting clients for GC + Auth
      const authClient = getAuthClient(accessToken);
      const classroom = getClassroomClient(authClient);

      // Fetching the actual information
      const coursesData = await getCourses(classroom);
      if (!coursesData) throw ERROR_EMPTY_RESPONSE;
      const studentsData = await getStudents(classroom, coursesData);

      return parseCourseData(coursesData, studentsData);
    } catch (e) {
      console.log("GC fetch failure:", e);
      return e;
    }
  }
);

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

// WARNING!!!!!!!!! NEXT 2 FUNCTIONS ARE SCARY
// Updating a doc on every single vote could result in a metric shit-ton of writes, and could easily push over the
// 20k threshhold. The only way I can think of avoiding this is by keeping score AND voted users in one document, which
// isn't really an option that I want to use.
// Perhaps some kind of timestamp that says you can't update something until after some delay would help?

/**
 * Occurs when a user changes their vote on a thread
 */
export const onThreadVote = functions.firestore
  .document("/threadVotes/{threadVoteId}")
  .onUpdate(async (change, ctx) => {
    // Don't need to check user auth because if it made it here, then they already are authorized to make the request
    try {
      const db = admin.firestore();
      const diff = findVotesDiff(
        change.before.get("votes") as Vote[],
        change.after.get("votes") as Vote[]
      );
      await db.runTransaction(async (t) => {
        diff.forEach(([prev, curr]) => {
          const threadRef = db.collection("threads").doc(curr.id);
          // Should go through diffs and make sure one document isn't updated multiple times, waste of updates
          return t.update(threadRef, {
            score: admin.firestore.FieldValue.increment(
              curr.value - prev.value
            ),
          });
        });
      });
    } catch (e) {
      console.log("Update thread votes failed:", e);
      return e;
    }
  });

/**
 * Occurs when a user changes their vote on a message
 */
export const onMessageVote = functions.firestore
  .document("/threadVotes/{threadVoteId}")
  .onUpdate(async (change, ctx) => {
    // Don't need to check user auth because if it made it here, then they already are authorized to make the request
    try {
      const db = admin.firestore();
      const diff = findVotesDiff(
        change.before.get("votes") as Vote[],
        change.after.get("votes") as Vote[]
      );
      await db.runTransaction(async (t) => {
        diff.forEach(([prev, curr]) => {
          const messageRef = db.collection("messages").doc(curr.id);
          // Should go through diffs and make sure one document isn't updated multiple times, waste of updates
          return t.update(messageRef, {
            score: admin.firestore.FieldValue.increment(
              curr.value - prev.value
            ),
          });
        });
      });
    } catch (e) {
      console.log("Update message votes failed:", e);
      return e;
    }
  });

/**
 * Every day, clean out empty user profiles from the users, classes, and rosters collections
 * Ideally, do so in the order of roster, classes, then users, so you know the important data before
 */
export const purgeEmptyUsers = functions.pubsub
  .schedule("every 12 hours")
  .timeZone("America/New_York")
  .onRun(async (ctx) => {
    const db = admin.firestore();
    try {
      await db.runTransaction(async (t) => {
        const emptyUserQuery = db.collection("users").where("uid", "==", "");
        const emptyUserDocs = (await t.get(emptyUserQuery)).docs;
        const expiredUserRefs: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[] = [];
        emptyUserDocs.forEach((doc) => {
          const creationMS = (doc.get("created") as admin.firestore.Timestamp)
            .seconds;
          const currentMS = Date.now();
          // sec -> mins -> hrs -> days -> 2 wks
          const twoWeekMS = 1000 * 60 * 60 * 24 * 14;
          if (currentMS - creationMS < twoWeekMS) expiredUserRefs.push(doc.ref);
        });

        expiredUserRefs.forEach((userRef) => {
          t.delete(userRef);
        });
      });
    } catch (e) {
      console.log("Empty user deletion failure:", e);
    }
  });

//Should probably clear out empty / inactive classes, too.
