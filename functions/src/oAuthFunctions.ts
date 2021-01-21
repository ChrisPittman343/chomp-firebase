import { classroom_v1, google } from "googleapis";
import { REDIRECT_URI, SCOPES } from "./credentials";

/**
 * Sets default authorization for Google API calls
 * @param accessToken user access token
 * @returns authorized oAuth2Client
 */
export function getAuthClient(accessToken: string) {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    REDIRECT_URI
  );
  oAuth2Client.setCredentials({
    scope: SCOPES.join(" "),
    access_token: accessToken,
  });
  google.options({ auth: oAuth2Client });
  return oAuth2Client;
}

export function getClassroomClient(auth: any) {
  return google.classroom({ version: "v1", auth });
}

export async function getCourses(
  classroom: classroom_v1.Classroom,
  numCourses = 5
) {
  return classroom.courses
    .list({
      courseStates: ["ACTIVE"],
      teacherId: "me",
      pageSize: numCourses,
    })
    .then((courses) => courses.data.courses)
    .catch((e) => {
      console.log("Course fetch failure:", e);
      throw e;
    });
}

export async function getStudents(
  classroom: classroom_v1.Classroom,
  courses: classroom_v1.Schema$Course[],
  numStudents = 40
): Promise<classroom_v1.Schema$Student[][]> {
  const promises = [];
  for (const course of courses) {
    promises.push(
      classroom.courses.students.list({
        courseId: course.id!,
        pageSize: numStudents,
      })
    );
  }
  return Promise.all(promises)
    .then((res) => {
      if (!res || res.length === 0) return [];
      return res.map((d) => (d.data.students ? d.data.students : []));
    })
    .catch((e) => {
      console.log("Students fetch failure:", e);
      throw e;
    });
}

export function parseCourseData(
  coursesData: classroom_v1.Schema$Course[],
  studentsData: classroom_v1.Schema$Student[][]
) {
  const classData = [];
  for (let i = 0; i < coursesData.length; i++) {
    const course = {
      name: coursesData[i].name!,
      section: coursesData[i].section,
      description: coursesData[i].description,
    };
    const roster = studentsData[i]?.map((student) => {
      return student.profile?.emailAddress;
    });
    classData.push({
      course,
      roster,
    });
  }
  return classData;
}
