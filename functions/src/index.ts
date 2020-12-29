import * as functions from "firebase-functions";
import cors = require("cors");
import express = require("express");
import { listCourses, listStudents } from "./oAuthFunctions";
import * as admin from "firebase-admin";

admin.initializeApp();

//#region Express
const app = express();
app.use(cors({ origin: true }));
//@ts-ignore
app.options("*", cors());

app.route("/get-classes").post(async (req, res) => {
  const authHeader = req.header("Authorization");
  if (!authHeader) {
    res.statusCode = 401;
    res.send(authHeader);
  }

  const classData = await listCourses(authHeader!);
  const studentData = await listStudents(authHeader!);
  const testResponse = {
    courses: classData,
    students: studentData,
  };
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(JSON.stringify(testResponse));
});

exports.widgets = functions.https.onRequest(app);
//#endregion

functions.firestore.document("/users").onCreate((snapshot, context) => {
  snapshot.get("uid");
});
