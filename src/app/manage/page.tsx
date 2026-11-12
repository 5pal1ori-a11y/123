import { ManageHomeLogin } from "@/components/manage/manage-home-login";

export const metadata = {
  title: "DOES Manage",
  description: "Discord 서버 관리봇 웹패널",
};

export default function ManageHomePage() {
  return <ManageHomeLogin />;
}
