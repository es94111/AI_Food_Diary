import { NextResponse } from "next/server";
import { encryptJson } from "@/lib/encryption";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { profileSchema } from "@/lib/validators";

export async function GET() {
  const user = await requireUser();
  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  const body = profileSchema.parse(await request.json());

  const profile = await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {
      gender: body.gender,
      birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
      heightCm: body.heightCm,
      weightKg: body.weightKg,
      activityLevel: body.activityLevel,
      goal: body.goal,
      calorieTarget: body.calorieTarget,
      encryptedPreferences: body.preferences ? encryptJson(body.preferences) : undefined,
      encryptedAllergies: body.allergies ? encryptJson(body.allergies) : undefined
    },
    create: {
      userId: user.id,
      gender: body.gender,
      birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
      heightCm: body.heightCm,
      weightKg: body.weightKg,
      activityLevel: body.activityLevel,
      goal: body.goal,
      calorieTarget: body.calorieTarget,
      encryptedPreferences: body.preferences ? encryptJson(body.preferences) : undefined,
      encryptedAllergies: body.allergies ? encryptJson(body.allergies) : undefined
    }
  });

  return NextResponse.json({ profile });
}
