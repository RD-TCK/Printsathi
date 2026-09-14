import { redirect } from "next/navigation";

// Public track page lives at /track (no auth required)
export default function CustomerTrackRedirect() {
  redirect("/track");
}
