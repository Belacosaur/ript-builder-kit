export const CLIENT_BUILD =
  typeof __CLIENT_BUILD__ === "string"
    ? __CLIENT_BUILD__
    : "unbundled-unverified";
