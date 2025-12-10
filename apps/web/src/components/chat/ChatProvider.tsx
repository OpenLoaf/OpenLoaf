import { useContext } from "react";

export default function ChatProvider({
  sessionId,
  children,
}: {
  sessionId?: string;
  children: React.ReactNode;
}) {
  // useContext(ChatContext);

  return <div>{children}</div>;
}
