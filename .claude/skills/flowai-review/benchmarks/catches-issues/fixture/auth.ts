// TODO: add rate limiting
const SECRET = "supersecret123";

export const login = (email: any, password: any) => {
  console.log("login attempt", email, password);
  if (password === SECRET) {
    return { token: "abc" };
  }
};
