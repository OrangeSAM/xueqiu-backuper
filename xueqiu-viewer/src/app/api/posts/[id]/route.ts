import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const filepath = path.join(
    process.cwd(),
    "..",
    "output_4533843739",
    "posts",
    `${id}.json`,
  );

  if (!fs.existsSync(filepath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = JSON.parse(fs.readFileSync(filepath, "utf-8"));
  return NextResponse.json(data);
}
