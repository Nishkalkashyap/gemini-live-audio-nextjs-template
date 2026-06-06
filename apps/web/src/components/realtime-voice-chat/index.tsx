"use client";

import { VoiceChatProvider } from "./context";
import { VoiceChatView } from "./view";

export function RealtimeVoiceChat() {
  return (
    <VoiceChatProvider>
      <VoiceChatView.Layout>
        <VoiceChatView.ConversationPanel>
          <VoiceChatView.Header />
          <VoiceChatView.AudioMeters />
          <VoiceChatView.Controls />
          <VoiceChatView.Composer />
          <VoiceChatView.Transcript />
        </VoiceChatView.ConversationPanel>
        <VoiceChatView.DetailsPanel />
      </VoiceChatView.Layout>
    </VoiceChatProvider>
  );
}
