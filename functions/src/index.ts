import * as functions from "firebase-functions";
import cors = require("cors");
import express = require("express");
import * as admin from "firebase-admin";
import {
  getAuthClient,
  getClassroomClient,
  getCourses,
  getStudents,
  parseCourseData,
} from "./oAuthFunctions";
import { ERROR_401, ERROR_CLASS_REQUEST } from "./errors";
import { verifyBasicAuth } from "./verifyRequest";
import { NewClassData } from "./types";

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
          .then(() => {
            console.log(9);
          })
          .catch((err) => err);
      } else {
        //Otherwise, create a new document with their info. Since they haven't been added to other classes, this is all that needs to be done here.
        db.collection("users")
          .doc()
          .create(userInfo)
          .then()
          .catch((err) => err);
      }
    })
    .catch((err) => console.log(err));
});

export const createClass = functions.https.onCall(async (data, ctx) => {
  if (!ctx.auth || !ctx.auth.token.email) return ERROR_401;
  if (data.name && data.participants && data.participants.length > 40)
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
  batch.create(classRef, {
    name,
    section,
    description,
    tags: [],
    participants: participants_lc,
    roster: rosterRef.id,
  });
  //Create a new roster document with each participant's email
  batch.create(rosterRef, {
    class: classRef.id,
    participants: participants_lc,
  });

  return batch
    .commit()
    .then(() => "Class created successfully!")
    .catch((err) => err);
});

// Every day, clean out empty user profiles from the users, classes, and rosters collections
// Ideally, do so in the order of roster, classes, then users, so you know the important data before
// Should probably clear out empty / inactive classes, too.
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
        throw new Error(err);
      });
    users.forEach((user) => {
      //const email = user.get("email");
    });
  });
