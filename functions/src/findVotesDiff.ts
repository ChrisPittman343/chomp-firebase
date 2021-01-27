import { Vote } from "./types";

/**
 * Gets before + after values of votes that were changed
 *
 * **WARNING** If prev + curr votes have the same lengths but are mixed with different vote ids,
 * the function won't detect a difference and will lead to some pretty nasty bugs.
 * @param prevVotes
 * @param currVotes
 * @returns a list of tuples containing the vote BEFORE the change, followed by the vote AFTER the change ([prev, curr][])
 */
export const findVotesDiff = (prevVotes: Vote[], currVotes: Vote[]) => {
  const diff: [Vote, Vote][] = [];
  if (currVotes.length >= prevVotes.length) {
    currVotes.forEach((vote) => {
      const prevVote = prevVotes.find((v) => v.id === vote.id);
      if (!prevVote || { ...vote } !== { ...prevVote })
        diff.push([
          { id: vote.id, value: prevVote ? prevVote.value : 0 },
          { ...vote },
        ]);
    });
  } else {
    prevVotes.forEach((vote) => {
      const currVote = prevVotes.find((v) => v.id === vote.id);
      if (!currVote || { ...vote } !== { ...currVote })
        diff.push([
          { ...vote },
          { id: vote.id, value: currVote ? currVote.value : 0 },
        ]);
    });
  }
  return diff;
};
