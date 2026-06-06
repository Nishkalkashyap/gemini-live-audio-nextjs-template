"use client";

import { VoiceChatProvider } from "./context";
import { VoiceChatView } from "./view";

export function RealtimeVoiceChat({ initialChatId }: { initialChatId?: string }) {
  return (
    <VoiceChatProvider initialChatId={initialChatId}>
      <VoiceChatView.Layout>
        <VoiceChatView.Sidebar />
        <VoiceChatView.Main>
          <VoiceChatView.Header />
          <VoiceChatView.Transcript />
          <VoiceChatView.Composer />
        </VoiceChatView.Main>
      </VoiceChatView.Layout>
    </VoiceChatProvider>
  );
}
