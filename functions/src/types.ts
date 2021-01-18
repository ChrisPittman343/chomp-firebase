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
  isClosed: boolean;
  answerId?: string;
  numMessages: number;
  score: number;
  upvoters: string[];
  downvoters: string[];
  created: admin.firestore.Timestamp;
}

export interface NewMessageData {
  classId: string;
  threadId: string;
  parentId: string;
  message: string;
}

export interface MessageData {
  id: string;
  threadId: string;
  classId: string;
  parentId: string;
  score: number;
  upvoters: string[];
  downvoters: string[];
  message: string;
  email: string;
  sent: admin.firestore.Timestamp;
}

export interface ResolveThread {
  threadId: string;
  messageId: string;
}
