export const ERROR_401 = {
  code: 401,
  message:
    "Either the Firebase userId is invalid, or the access token sent with the request is invalid. Try re-logging in and making the same request.",
  status: "UNAUTHENTICATED",
};

export const ERROR_CLASS_REQUEST = {
  code: 400,
  message:
    "Class could not be made due to a bad request. This could be caused by two things:\nA class name is required, but was omitted.\nMaximum participants is 40. Select fewer students to create this class.",
  status: "BAD REQUEST",
};
