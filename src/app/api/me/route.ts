import { NextResponse } from "next/server";
import { encryptJson } from "@/lib/encryption";
import { decryptProfile, encryptProfileWrite } from "@/lib/profile-crypto";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { profileSchema } from "@/lib/validators";

export async function GET() {
  const user = await requireUser();
  // Never leak ciphertext / leftover plaintext columns to the client.
  return NextResponse.json({ user: { ...user, profile: decryptProfile(user.profile) } });
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  const body = profileSchema.parse(await request.json());

  // Sensitive body fields go to encrypted columns (plaintext columns cleared);
  // non-sensitive fields stay plaintext for app logic.
  const bodyEnc = encryptProfileWrite({
    gender: body.gender,
    birthDate: body.birthDate,
    heightCm: body.heightCm,
    weightKg: body.weightKg
  });
  const common = {
    ...bodyEnc,
    activityLevel: body.activityLevel,
    goal: body.goal,
    calorieTarget: body.calorieTarget,
    encryptedPreferences: body.preferences ? encryptJson(body.preferences) : undefined,
    encryptedAllergies: body.allergies ? encryptJson(body.allergies) : undefined
  };

  const profile = await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: common,
    create: { userId: user.id, ...common }
  });

  return NextResponse.json({ profile: decryptProfile(profile) });
}
