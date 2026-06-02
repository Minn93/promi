import { SignupForm } from "@/components/signup-form";
import { notFound } from "next/navigation";
import { isPublicBetaSignupEnabledServer } from "@/src/lib/internal-beta-mode";

export default function SignupPage() {
  const signupEnabled = isPublicBetaSignupEnabledServer();
  if (!signupEnabled) {
    notFound();
  }
  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <SignupForm enabled={signupEnabled} />
    </div>
  );
}
