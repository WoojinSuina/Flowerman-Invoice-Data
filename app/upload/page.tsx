import { redirect } from "next/navigation";

// Upload now lives on the Jobs page — kept as a redirect instead of a 404
// in case anything still links to /upload.
export default function UploadPage() {
  redirect("/jobs");
}
