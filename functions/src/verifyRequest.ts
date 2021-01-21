// In case I need to use it again, here is the express method for getting GC classes:

// import { Request, Response } from "express";
// import * as admin from "firebase-admin";
// import { ERROR_401 } from "./errors";

// /**
//  * Verifies that the idToken sent is valid
//  * @returns authenticated user if successful, else sends an error
//  */
// export async function verifyBasicAuth(
//   req: Request,
//   res: Response
// ): Promise<admin.auth.DecodedIdToken> {
//   const authHeader = req.header("Authorization");
//   if (!authHeader) {
//     res.status(401).send(ERROR_401);
//     throw new Error();
//   }
//   const idToken = authHeader;
//   const user = admin
//     .auth()
//     .verifyIdToken(idToken)
//     .then((value) => value)
//     .catch((err) => err);
//   return user;
// }

// //#region Express
// const app = express();
// app.use(cors({ origin: true, methods: ["GET", "POST"] }));

// app.post("/get-classes", async (req, res) => {
//   res.setHeader("Access-Control-Allow-Origin", "*");
//   const idToken = req.header("Authorization");
//   const accessToken = req.header("Access-Token");
//   if (!idToken || !accessToken) res.send(ERROR_401);
//   verifyBasicAuth(req, res)
//     .then()
//     .catch((err) => res.send(ERROR_401));
//   const authClient = getAuthClient(accessToken!);
//   const classroom = getClassroomClient(authClient);
//   const coursesData = await getCourses(classroom);
//   const studentsData = await getStudents(classroom, coursesData!);
//   if (!coursesData || !studentsData) {
//     res.status(401).send(ERROR_401);
//   }
//   const classData = parseCourseData(coursesData!, studentsData);
//   res.send(classData);
// });

// exports.widgets = functions.https.onRequest(app);
// //#endregion
