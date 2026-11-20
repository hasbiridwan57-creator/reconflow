import { db as prisma } from "@/lib/db";
import { success, handleError } from "@/lib/api";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return success({ status: "ok", timestamp: new Date().toISOString() });
  } catch (error) {
    return handleError(error);
  }
}
