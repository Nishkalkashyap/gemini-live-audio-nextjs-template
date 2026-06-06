import { RealtimeVoiceChat } from "@/components/realtime-voice-chat";

type ChatPageProps = {
  params: Promise<{
    chatId: string;
  }>;
};

export default async function ChatPage({ params }: ChatPageProps) {
  const { chatId } = await params;

  return <RealtimeVoiceChat initialChatId={chatId} />;
}
