// Shared request boundary. Values are local counters, never account credentials.
let epoch = 0;
export const getIdentityEpoch = () => epoch;
export const advanceIdentityEpoch = () => { epoch += 1; };
