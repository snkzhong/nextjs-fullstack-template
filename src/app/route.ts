import { NextResponse } from "next/server";
import { prisma } from "~/backend/context";

export async function GET() {
  console.log("merge:", global.serverContext.getConfig("merge"));
  let rs = await prisma.test.findMany();
  console.log("prisma rs:", rs);
  return NextResponse.json({ message: "Hello world!" });
}
