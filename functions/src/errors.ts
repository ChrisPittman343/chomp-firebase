export const ERROR_401 = {
  code: 401,
  message:
    "Either the Firebase userId is invalid, or the access token sent with the request is invalid. Try re-logging in and making the same request.",
  status: "UNAUTHENTICATED",
};

export const ERROR_EMPTY_RESPONSE = {
  code: 404,
  message: "Data that needs to be queried does not exist.",
  status: "EMPTY",
};

export const ERROR_CLASS_REQUEST = {
  code: 400,
  message:
    "Class could not be made due to a bad request. A class request requires two things: A class name, and 0 <= NumParticipants < 40.",
  status: "BAD REQUEST",
};

export const ERROR_THREAD_REQUEST = {
  code: 400,
  message:
    "Thread could not be made due to a bad request. A thread request requires a few things: A title < 300 characters, (Optional) A message < 1500 characters, Valid classId, and Valid tags",
  status: "BAD REQUEST",
};

export const ERROR_MESSAGE_REQUEST = {
  code: 400,
  message:
    "Message could not be made due to a bad request. A message request requires a few things: A message < 2000 characters, Valid classId + threadId + parentId",
  status: "BAD REQUEST",
};
