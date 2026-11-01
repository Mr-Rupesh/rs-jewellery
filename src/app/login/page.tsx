import { LoginForm } from "@/components/login-form";
import { PhoneLogin } from "@/components/phone-login";

// Phone OTP is kept in the code but switched off. Set NEXT_PUBLIC_ENABLE_PHONE_LOGIN=true to show it again.
export default function LoginPage() {
  return (
    <div className="space-y-12">
      <LoginForm />
      {process.env.NEXT_PUBLIC_ENABLE_PHONE_LOGIN === "true" && <PhoneLogin />}
    </div>
  );
}
