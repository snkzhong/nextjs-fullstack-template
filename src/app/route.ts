import { NextResponse } from "next/server";

export async function GET() {
  console.log("merge:", global.serverContext.getConfig("merge"));
  return NextResponse.json({ message: "Hello world!" });
}
