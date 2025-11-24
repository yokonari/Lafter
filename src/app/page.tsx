import { Suspense } from "react";
import { UserHome } from "@/components/user/UserHome";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <UserHome />
    </Suspense>
  );
}
