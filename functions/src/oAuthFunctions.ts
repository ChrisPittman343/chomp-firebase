/* eslint-disable no-shadow */
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.rosters.readonly",
  "https://www.googleapis.com/auth/classroom.profile.emails",
  "https://www.googleapis.com/auth/classroom.profile.photos",
];
const CLIENT_ID =
  "152270180248-gfve9pbk9sr4r22hv3ostausv95eurnp.apps.googleusercontent.com";
const CLIENT_SECRET = "uoD33lCt2B8j9oZ-SHmZztWS";
const REDIRECT_URI = "https://chomp-chat.firebaseapp.com/__/auth/handler";

/**
 * Sets default authorization for Google API calls
 * @param accessToken user access token
 * @returns authorized oAuth2Client
 */
function getAuthClient(accessToken: string) {
  const oAuth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  );
  oAuth2Client.setCredentials({
    scope: SCOPES.join(" "),
    access_token: accessToken,
  });
  google.options({ auth: oAuth2Client });
  return oAuth2Client;
}

export async function listCourses(accessToken: string) {
  getAuthClient(accessToken);
  const classroom = google.classroom("v1");

  const classes = await classroom.courses.list({
    courseStates: ["ACTIVE"],
    pageSize: 10,
  });

  return classes;
}

export async function listStudents(accessToken: string) {
  getAuthClient(accessToken);
  const classroom = google.classroom("v1");
  let students;
  try {
    const classes = await classroom.courses.list({
      access_token: accessToken,
      pageSize: 3,
    });
    const firstId = classes.data.courses![0].id!;
    students = await classroom.courses.students.list({
      courseId: firstId,
      pageSize: 20,
    });
    return students;
  } catch (err) {
    students = `ERROR: ${err}`;
  }

  return students;
}
