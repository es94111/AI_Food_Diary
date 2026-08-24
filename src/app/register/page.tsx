import { redirect } from "next/navigation";

// Preserve the old bookmark without exposing a local registration form. Google
// SSO creates a new account automatically on the first successful sign-in.
export default function RegisterPage() {
  redirect("/login");
}
