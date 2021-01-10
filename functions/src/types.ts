import * as admin from "firebase-admin";

export interface NewClassData {
  name: string;
  section?: string;
  description?: string;
  participants?: string[];
}

export interface ClassData {
  id: string;
  name: string;
  section?: string;
  description?: string;
  participants?: string[];
  roster: string;
  tags?: string[];
}

export interface NewThreadData {
  classId: string;
  title: string;
  message?: string;
  tags?: string[];
  anonymous: boolean;
}

export interface ThreadData {
  id: string;
  classId: string;
  className: string;
  email: string;
  title: string;
  message?: string;
  tags?: string[];
  status: {
    isClosed: boolean;
    isResolved: boolean;
    numMessages: number;
  };
  created: admin.firestore.Timestamp;
}
