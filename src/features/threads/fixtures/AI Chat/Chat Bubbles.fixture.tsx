import { ChatBubble } from "@/features/threads/chat-message";

export default <div className="mx-auto grid max-w-3xl gap-3">
  <ChatBubble role="user">Can you add a Cosmos catalog?</ChatBubble>
  <ChatBubble role="assistant">{"Done. The catalog uses **real components** and deterministic fixtures."}</ChatBubble>
</div>;
