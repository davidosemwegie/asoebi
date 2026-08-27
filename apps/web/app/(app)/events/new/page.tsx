import { redirect } from "next/navigation"

export default function NewEventPage() {
  redirect("/?eventEditor=create")
}
