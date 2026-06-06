"use client";

import {
  CircleAlert,
  Download,
  Info,
  Mic,
  Mic2,
  Plus,
  ScreenShare,
  ScreenShareOff,
  Settings2,
  Square,
  Trash2
} from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from "@/components/ai-elements/conversation";
import {
  Message as AIMessage,
  MessageContent,
  MessageResponse
} from "@/components/ai-elements/message";
import {
  MicSelector,
  MicSelectorContent,
  MicSelectorEmpty,
  MicSelectorInput,
  MicSelectorItem,
  MicSelectorLabel,
  MicSelectorList,
  MicSelectorTrigger,
  MicSelectorValue
} from "@/components/ai-elements/mic-selector";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools
} from "@/components/ai-elements/prompt-input";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import {
  useVoiceSelector,
  VoiceSelector,
  VoiceSelectorAttributes,
  VoiceSelectorBullet,
  VoiceSelectorContent,
  VoiceSelectorDescription,
  VoiceSelectorEmpty,
  VoiceSelectorGroup,
  VoiceSelectorInput,
  VoiceSelectorItem,
  VoiceSelectorList,
  VoiceSelectorName,
  VoiceSelectorTrigger
} from "@/components/ai-elements/voice-selector";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { LIVE_MODEL_OPTIONS } from "@/lib/live-models";
import { useVoiceChat } from "./context";
import type {
  LiveMediaResolution,
  Message,
  ScreenFrameRate,
  ToolPermissionMode,
  VoiceOption
} from "./types";
import { VOICE_OPTIONS } from "./voice-options";

const LIVE_MEDIA_RESOLUTION_OPTIONS: Array<{
  label: string;
  value: LiveMediaResolution;
}> = [
  { label: "High res", value: "high" },
  { label: "Medium res", value: "medium" }
];

const SCREEN_FRAME_RATE_OPTIONS: Array<{ label: string; value: ScreenFrameRate }> = [
  { label: "0.2 FPS", value: 0.2 },
  { label: "0.5 FPS", value: 0.5 },
  { label: "1 FPS", value: 1 }
];

const TOOL_PERMISSION_OPTIONS: Array<{ label: string; value: ToolPermissionMode }> = [
  { label: "Always ask", value: "always-ask" },
  { label: "Always allow", value: "always-allow" }
];

type ToolState = ComponentProps<typeof ToolHeader>["state"];

function Layout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider className="h-svh overflow-hidden bg-background text-foreground">
      {children}
    </SidebarProvider>
  );
}

function SidebarView() {
  const {
    actions: { createThread, deleteThread, selectThread },
    state: { activeThreadId, threads }
  } = useVoiceChat();

  return (
    <Sidebar collapsible="offcanvas" className="border-sidebar-border">
      <SidebarHeader>
        <div className="flex min-h-9 items-center justify-between px-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Gemini Live</div>
            <div className="text-xs text-muted-foreground">Realtime audio</div>
          </div>
        </div>
        <Button className="w-full justify-start" variant="secondary" onClick={() => void createThread()}>
          <Plus />
          New chat
        </Button>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {threads.map((thread) => {
                const isActive = thread.id === activeThreadId;

                return (
                  <SidebarMenuItem key={thread.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      size="lg"
                      tooltip={thread.title}
                      onClick={() => void selectThread(thread.id)}
                    >
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate">{thread.title}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {formatThreadTime(thread.updatedAt)}
                        </span>
                      </span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      aria-label={`Delete chat: ${thread.title}`}
                      showOnHover
                      onClick={() => void deleteThread(thread.id)}
                    >
                      <Trash2 />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 text-xs text-muted-foreground">{threads.length} saved chats</div>
      </SidebarFooter>
    </Sidebar>
  );
}

function Main({ children }: { children: ReactNode }) {
  return <SidebarInset className="h-svh min-w-0 overflow-hidden">{children}</SidebarInset>;
}

function Header() {
  const {
    state: { activeThreadId, threads }
  } = useVoiceChat();
  const activeThread = threads.find((thread) => thread.id === activeThreadId);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="md:hidden" />
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase text-muted-foreground">Gemini Live API</div>
          <h1 className="truncate text-base font-semibold md:text-lg">
            {activeThread?.title || "Realtime audio chat"}
          </h1>
        </div>
      </div>
    </header>
  );
}

function ModelSelect() {
  const {
    actions: { setModel },
    meta: { isLive, isStarting },
    state: { model }
  } = useVoiceChat();

  return (
    <Select value={model} onValueChange={setModel} disabled={isLive || isStarting}>
      <SelectTrigger
        className="h-7 w-[9.5rem] min-w-0 rounded-md bg-muted/30 text-xs [&_[data-slot=select-value]]:block [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
        aria-label="Gemini Live model"
      >
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent align="end" className="w-[22rem]">
        <SelectGroup>
          {LIVE_MODEL_OPTIONS.map((option) => (
            <SelectItem key={option.id} value={option.id} textValue={`${option.label} ${option.id}`}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function MediaResolutionSelect({ className }: { className?: string }) {
  const {
    actions: { setMediaResolution },
    meta: { isLive, isStarting },
    state: { mediaResolution }
  } = useVoiceChat();

  return (
    <Select
      value={mediaResolution}
      onValueChange={(value) => setMediaResolution(parseMediaResolution(value))}
      disabled={isLive || isStarting}
    >
      <SelectTrigger
        className={cn("h-7 w-[7rem] rounded-md bg-muted/30 text-xs", className)}
        aria-label="Media resolution"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {LIVE_MEDIA_RESOLUTION_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ToolPermissionSelect() {
  const {
    actions: { setToolPermissionMode },
    state: { toolPermissionMode }
  } = useVoiceChat();

  return (
    <Select
      value={toolPermissionMode}
      onValueChange={(value) => setToolPermissionMode(parseToolPermissionMode(value))}
    >
      <SelectTrigger className="h-7 w-[7.5rem] rounded-md bg-muted/30 text-xs" aria-label="Tool permission">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {TOOL_PERMISSION_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function Transcript() {
  const {
    state: { messages }
  } = useVoiceChat();
  const hasMessages = messages.length > 0;

  return (
    <Conversation className="min-h-0">
      <ConversationContent className="mx-auto w-full max-w-4xl gap-5 px-4 py-6 md:px-6">
        {hasMessages ? (
          messages.map((message) => <TranscriptMessage key={message.id} message={message} />)
        ) : (
          <ConversationEmptyState
            className="min-h-[calc(100svh-15rem)]"
            icon={<Mic2 className="size-10" />}
            title="Ready when you are"
            description="Ask a question, talk through an idea, or bring your screen into the conversation."
          />
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

function TranscriptMessage({ message }: { message: Message }) {
  if (message.role === "tool") {
    return <ToolMessage message={message} />;
  }

  if (message.role === "system" || message.role === "error") {
    const isError = message.role === "error";

    return (
      <div
        className={cn(
          "mx-auto flex w-full max-w-3xl items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm",
          isError && "border-destructive/40 bg-destructive/10 text-destructive"
        )}
        role={isError ? "alert" : "status"}
      >
        {isError ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
        <MessageResponse className="min-w-0">{message.text}</MessageResponse>
      </div>
    );
  }

  return (
    <AIMessage from={message.role === "user" ? "user" : "assistant"}>
      <MessageContent>
        <MessageResponse>{message.text}</MessageResponse>
      </MessageContent>
    </AIMessage>
  );
}

function ToolMessage({ message }: { message: Message }) {
  const {
    actions: { approveToolCall, denyToolCall }
  } = useVoiceChat();
  const state = getToolState(message.toolStatus);
  const input = parseToolMarkdown(message.toolRequestMarkdown);
  const output = parseToolMarkdown(message.toolResponseMarkdown);
  const errorText =
    message.toolStatus === "error" || message.toolStatus === "denied"
      ? getToolErrorText(output, message.toolResponseMarkdown)
      : undefined;
  const toolApproval =
    message.toolStatus === "approval-requested" ? message.toolApproval : undefined;
  const [isOpen, setIsOpen] = useState(Boolean(toolApproval));

  useEffect(() => {
    setIsOpen(Boolean(toolApproval));
  }, [toolApproval, message.toolStatus]);

  return (
    <AIMessage from="assistant" className="max-w-3xl">
      <MessageContent className="w-full">
        <Tool className="bg-card/40" open={isOpen} onOpenChange={setIsOpen}>
          <ToolHeader
            type="dynamic-tool"
            state={state}
            toolName={message.toolName ?? "tool"}
            title={message.text}
          />
          {message.toolImage ? <ToolImagePreview image={message.toolImage} /> : null}
          <ToolContent>
            <ToolInput input={input} />
            {toolApproval ? (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                <div className="grid gap-1">
                  <div className="text-sm font-medium">{toolApproval.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {toolApproval.description}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => denyToolCall(toolApproval.callId)}
                  >
                    {toolApproval.denyLabel}
                  </Button>
                  <Button size="sm" onClick={() => approveToolCall(toolApproval.callId)}>
                    {toolApproval.approveLabel}
                  </Button>
                </div>
              </div>
            ) : null}
            <ToolOutput output={output} errorText={errorText} />
          </ToolContent>
        </Tool>
      </MessageContent>
    </AIMessage>
  );
}

function ToolImagePreview({ image }: { image: NonNullable<Message["toolImage"]> }) {
  const imageUrl = `data:${image.mimeType};base64,${image.data}`;

  return (
    <div className="space-y-3 border-t p-3">
      <img
        src={imageUrl}
        alt="Captured screenshot"
        className="max-h-[28rem] w-full rounded-md border object-contain"
      />
      <div className="flex justify-end">
        <Button asChild size="sm" variant="outline">
          <a href={imageUrl} download={image.filename}>
            <Download className="size-4" />
            Download
          </a>
        </Button>
      </div>
    </div>
  );
}

function Composer() {
  const {
    actions: { setTextInput, submitText },
    meta: { canSendText },
    state: { status, textInput }
  } = useVoiceChat();

  return (
    <div className="mx-auto w-full max-w-4xl shrink-0 px-4 pb-4 md:px-6">
      <PromptInput
        className="rounded-xl border bg-background shadow-lg"
        onSubmit={(message) => {
          setTextInput(message.text);
          submitText();
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            value={textInput}
            placeholder={canSendText ? "Ask anything" : "Start voice chat to send a message"}
            onChange={(event) => setTextInput(event.currentTarget.value)}
          />
        </PromptInputBody>
        <PromptInputFooter className="items-end">
          <PromptInputTools className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 pb-0.5">
            <ModelSelect />
            <ToolPermissionSelect />
            <VoiceSelect />
            <ScreenShareControls />
            <VoiceControls />
            <AdvancedSettingsMenu />
          </PromptInputTools>
          <PromptInputSubmit
            className="mb-0.5 shrink-0"
            disabled={!canSendText || !textInput.trim()}
            status={status === "Error" ? "error" : "ready"}
          />
        </PromptInputFooter>
      </PromptInput>
      <AudioMeters />
      <ConnectionStatus />
    </div>
  );
}

function VoiceSelect() {
  const {
    actions: { setVoiceName },
    meta: { isLive, isStarting },
    state: { voiceName }
  } = useVoiceChat();
  const isDisabled = isStarting || isLive;

  return (
    <VoiceSelector value={voiceName} onValueChange={(value) => value && setVoiceName(value)}>
      <VoiceSelectorTrigger asChild>
        <PromptInputButton
          className="h-7 rounded-md bg-muted/30 text-xs"
          disabled={isDisabled}
          tooltip="Voice selector"
        >
          <Mic className="size-4" />
          <span className="max-w-24 truncate">{voiceName}</span>
        </PromptInputButton>
      </VoiceSelectorTrigger>
      <VoiceSelectorContent title="Voice selector">
        <VoiceSelectorInput placeholder="Search voices..." />
        <VoiceSelectorList>
          <VoiceSelectorEmpty>No voice found.</VoiceSelectorEmpty>
          <VoiceSelectorGroup heading="Gemini voices">
            {VOICE_OPTIONS.map((voice) => (
              <VoiceOptionItem key={voice.name} voice={voice} />
            ))}
          </VoiceSelectorGroup>
        </VoiceSelectorList>
      </VoiceSelectorContent>
    </VoiceSelector>
  );
}

function VoiceOptionItem({ voice }: { voice: VoiceOption }) {
  const { setOpen, setValue, value } = useVoiceSelector();

  return (
    <VoiceSelectorItem
      value={`${voice.name} ${voice.description}`}
      onSelect={() => {
        setValue(voice.name);
        setOpen(false);
      }}
    >
      <div className="grid min-w-0 flex-1 gap-1">
        <VoiceSelectorName>{voice.name}</VoiceSelectorName>
        <VoiceSelectorAttributes>
          <VoiceSelectorDescription>{voice.description}</VoiceSelectorDescription>
          <VoiceSelectorBullet />
          <VoiceSelectorDescription>Gemini</VoiceSelectorDescription>
        </VoiceSelectorAttributes>
      </div>
      {value === voice.name ? <Badge variant="secondary">Selected</Badge> : null}
    </VoiceSelectorItem>
  );
}

function AdvancedSettingsMenu() {
  return (
    <details className="relative shrink-0">
      <summary
        aria-label="More chat settings"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-8 cursor-pointer list-none p-0 marker:hidden [&::-webkit-details-marker]:hidden"
        )}
      >
        <Settings2 className="size-4" />
      </summary>
      <AdvancedSettingsPanel />
    </details>
  );
}

function AdvancedSettingsPanel() {
  return (
    <div
      role="dialog"
      aria-label="More chat settings"
      className="fixed bottom-44 left-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-72 -translate-x-1/2 gap-3 rounded-lg bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      <div className="grid gap-1">
        <div className="text-xs font-medium text-muted-foreground">Microphone</div>
        <MicSelectorPreview className="w-full" />
      </div>
      <div className="grid gap-1">
        <div className="text-xs font-medium text-muted-foreground">Screen frame rate</div>
        <ScreenFrameRateSelect className="w-full" />
      </div>
      <div className="grid gap-1">
        <div className="text-xs font-medium text-muted-foreground">Image quality</div>
        <MediaResolutionSelect className="w-full" />
      </div>
    </div>
  );
}

function MicSelectorPreview({ className }: { className?: string }) {
  return (
    <MicSelector>
      <MicSelectorTrigger
        disabled
        className={cn(
          "h-7 w-[8.75rem] min-w-0 justify-between rounded-md bg-muted/30 text-xs [&>span]:min-w-0 [&>span]:truncate",
          className
        )}
      >
        <MicSelectorValue />
      </MicSelectorTrigger>
      <MicSelectorContent>
        <MicSelectorInput />
        <MicSelectorList>
          {(devices) =>
            devices.length ? (
              devices.map((device) => (
                <MicSelectorItem key={device.deviceId} value={device.deviceId}>
                  <MicSelectorLabel device={device} />
                </MicSelectorItem>
              ))
            ) : (
              <MicSelectorEmpty />
            )
          }
        </MicSelectorList>
      </MicSelectorContent>
    </MicSelector>
  );
}

function ScreenFrameRateSelect({ className }: { className?: string }) {
  const {
    actions: { setScreenFrameRate },
    meta: { isLive },
    state: { isStartingScreenShare, screenFrameRate }
  } = useVoiceChat();

  return (
    <Select
      value={String(screenFrameRate)}
      onValueChange={(value) => setScreenFrameRate(parseScreenFrameRate(value))}
      disabled={!isLive || isStartingScreenShare}
    >
      <SelectTrigger
        className={cn("h-7 w-[5.75rem] rounded-md bg-muted/30 text-xs", className)}
        aria-label="Screen frame rate"
      >
        <SelectValue>{formatFrameRate(screenFrameRate)}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {SCREEN_FRAME_RATE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ScreenShareControls() {
  const {
    actions: { startScreenShare, stopScreenShare },
    meta: { isLive },
    state: { isScreenSharing, isStartingScreenShare }
  } = useVoiceChat();
  const isDisabled = !isLive || isStartingScreenShare;

  if (isScreenSharing) {
    return (
      <PromptInputButton
        tooltip="Stop screen sharing"
        variant="default"
        className="bg-primary text-primary-foreground ring-2 ring-primary/35 hover:bg-primary/90"
        onClick={stopScreenShare}
        aria-label="Stop screen sharing"
      >
        <ScreenShareOff className="size-4" />
      </PromptInputButton>
    );
  }

  return (
    <PromptInputButton
      tooltip="Start screen sharing"
      disabled={isDisabled}
      onClick={() => void startScreenShare()}
      aria-label="Start screen sharing"
    >
      <ScreenShare className="size-4" />
    </PromptInputButton>
  );
}

function VoiceControls() {
  const {
    actions: { startSession, stopSession },
    meta: { isLive, isStarting }
  } = useVoiceChat();

  if (isLive || isStarting) {
    return (
      <PromptInputButton
        tooltip="Stop voice chat"
        variant="destructive"
        onClick={() => void stopSession()}
        aria-label="Stop voice chat"
      >
        <Square className="size-4" />
      </PromptInputButton>
    );
  }

  return (
    <PromptInputButton
      tooltip="Start voice chat"
      variant="default"
      onClick={() => void startSession()}
      aria-label="Start voice chat"
    >
      <Mic className="size-4" />
    </PromptInputButton>
  );
}

function AudioMeters() {
  const {
    state: { inputLevel, outputLevel, status }
  } = useVoiceChat();

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-1 pt-3"
      aria-label="Audio levels"
    >
      <Progress value={Math.round(inputLevel * 100)} />
      <Badge variant={status === "Error" ? "destructive" : status === "Live" ? "default" : "secondary"}>
        {status}
      </Badge>
      <Progress value={Math.round(outputLevel * 100)} className="[&_[data-slot=progress-indicator]]:bg-amber-500" />
    </div>
  );
}

function ConnectionStatus() {
  const {
    state: { isScreenSharing, screenFrameRate, screenShareError }
  } = useVoiceChat();

  if (!isScreenSharing && !screenShareError) {
    return null;
  }

  return (
    <div className="flex min-h-7 flex-wrap items-center gap-2 px-1 pt-2 text-xs text-muted-foreground">
      {isScreenSharing ? <span>Screen {formatFrameRate(screenFrameRate)}</span> : null}
      {screenShareError ? <span className="text-destructive">{screenShareError}</span> : null}
    </div>
  );
}

function getToolState(status: Message["toolStatus"]): ToolState {
  if (status === "approval-requested") {
    return "approval-requested";
  }
  if (status === "approval-responded") {
    return "approval-responded";
  }
  if (status === "running") {
    return "input-available";
  }
  if (status === "denied") {
    return "output-denied";
  }
  if (status === "error") {
    return "output-error";
  }
  return "output-available";
}

function parseToolMarkdown(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const match = value.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const json = match?.[1] ?? value;

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return value;
  }
}

function getToolErrorText(output: unknown, fallback: string | undefined) {
  if (output && typeof output === "object" && "error" in output) {
    const error = (output as { error?: unknown }).error;
    return typeof error === "string" ? error : JSON.stringify(error);
  }

  return fallback;
}

function parseMediaResolution(value: string): LiveMediaResolution {
  return value === "medium" ? "medium" : "high";
}

function parseScreenFrameRate(value: string): ScreenFrameRate {
  if (value === "0.2") {
    return 0.2;
  }
  if (value === "0.5") {
    return 0.5;
  }
  return 1;
}

function parseToolPermissionMode(value: string): ToolPermissionMode {
  return value === "always-allow" ? "always-allow" : "always-ask";
}

function formatFrameRate(value: ScreenFrameRate) {
  return `${value} FPS`;
}

function formatThreadTime(timestamp: number) {
  if (!timestamp) {
    return "New";
  }

  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
    2,
    "0"
  )}`;
}

export const VoiceChatView = {
  Composer,
  Header,
  Layout,
  Main,
  Sidebar: SidebarView,
  Transcript
};
