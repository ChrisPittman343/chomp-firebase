// eslint-disable-next-line import/no-extraneous-dependencies
import { Request, Response } from "express";
import * as admin from "firebase-admin";
import { ERROR_401 } from "./errors";

/**
 * Verifies that the idToken sent is valid
 * @returns authenticated user if successful, else sends an error
 */
export async function verifyBasicAuth(
  req: Request,
  res: Response
): Promise<admin.auth.DecodedIdToken> {
  const authHeader = req.header("Authorization");
  if (!authHeader) {
    res.status(401).send(ERROR_401);
    throw new Error();
  }
  const idToken = authHeader;
  const user = admin
    .auth()
    .verifyIdToken(idToken)
    .then((value) => value)
    .catch((err) => err);
  return user;
}
