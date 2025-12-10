//@ts-ignore
export async function permissions({ ctx, next }) {
  console.log("进入权限校验");
  return next();
}
