import { AudioLines, BookOpen, Code2, Eye, FileText, FolderOpen, Keyboard, Layers, MessageSquare, Monitor, Network, Palette, ScanLine, ShieldCheck, Smartphone } from 'lucide-react';

export const FEATURES = [
  { group: 'context', icon: FileText, title: 'Answers with your context', text: 'Bring your résumé, the job description, and project notes into the conversation. Prepare introductions, explain your experience, and work through follow-ups with the details that matter.', label: 'Every plan' },
  { group: 'context', icon: AudioLines, title: 'Listening & transcription', text: 'Turn microphone or system audio into text so you can work with the question as it is asked. Choose local transcription or a supported provider to fit your setup.', label: 'Every plan' },
  { group: 'context', icon: ScanLine, title: 'Screenshot understanding', text: 'Capture a question, diagram, or error from your screen and attach it to the conversation. Ask about the exact problem in front of you without retyping it.', label: 'Every plan' },
  { group: 'technical', icon: Code2, title: 'A dedicated coding assistant', text: 'Work through algorithms, SQL, and technical problems with readable code, explanations, complexity analysis, and edge cases. Continue the conversation as the requirements change.', label: 'Pro and above' },
  { group: 'technical', icon: Network, title: 'System design, explained', text: 'Explore requirements, architecture, data flow, and failure scenarios. Turn the conversation into a diagram and understand the trade-offs behind each design choice.', label: 'Pro and above' },
  { group: 'technical', icon: FolderOpen, title: 'Your local code, in context', text: 'Select a project folder and ask an agent to read and search the relevant files. Trace a bug, understand a dependency, or review a proposed change. Local Coding is read-only; it does not apply or run changes.', label: 'Ultimate only' },
  { group: 'control', icon: Layers, title: 'A workspace that adapts', text: 'Adjust the desktop overlay’s transparency and click-through behavior to keep your work visible. Position the assistant where it is useful alongside your other applications.', label: 'Every plan' },
  { group: 'control', icon: Eye, title: 'Gaze-aware answers', text: 'Use camera-based eye tracking to bring the answer HUD closer to where you look. Calibrate it for your camera, lighting, and position before a session.', label: 'Pro, Ultimate & Lifetime' },
  { group: 'control', icon: Smartphone, title: 'A connected phone companion', text: 'Pair your phone with the desktop session to ask questions, capture the screen, and scroll answers remotely. Keep session controls within reach on a second screen.', label: 'Ultimate only' },

  { group: 'context', icon: MessageSquare, title: 'Seven modes. Every kind of round.', text: 'Chat, Recruiter Call, Technical Screen, and Behavioral Interview cover the conversation. Core includes Technical Screen and Behavioral Interview. Pro adds Chat, Recruiter Call, Code, and System Design. Ultimate adds Local Coding.', label: 'Modes vary by plan' },
  { group: 'context', icon: BookOpen, title: 'Behavioral answers with a structure', text: 'Choose STAR, CAR, PAR, SOAR, or let Novi pick the framework. Use your own experience and session instructions to shape the answer.', label: 'Every plan' },
  { group: 'control', icon: ShieldCheck, title: 'App mask & window identity', text: 'Choose a window name and icon; hide windows from the Windows taskbar or macOS Dock. Linux support varies. Running processes remain visible in system tools.', label: 'Every plan · OS-dependent' },
  { group: 'control', icon: Keyboard, title: 'Shortcuts that keep you moving', text: 'Set hotkeys for transparency, click-through, screenshots, system audio, the code viewer, and Behavioral Studio. Advanced tools follow your plan access.', label: 'Every plan' },
  { group: 'control', icon: Monitor, title: 'Screen capture protection', text: 'Transparent mode enables OS-level capture protection for Novi windows. Results depend on your operating system and capture software; test your actual setup.', label: 'Every plan · OS-dependent' },
  { group: 'control', icon: Palette, title: 'A workspace you can actually read', text: 'Adjust text size, color palettes, and overlay opacity. Move the floating tray and answer windows to the monitor and position that work for you.', label: 'Every plan' },
] as const;

export const FEATURE_GROUPS = [
  { id: 'context', title: 'Bring the question. And the lore.', description: 'Your background, the live question, and the right conversation mode.' },
  { id: 'technical', title: 'The technical round, equipped.', description: 'Coding, architecture, and real project context. Coding and system design on Pro and Lifetime; local project assistance on Ultimate.' },
  { id: 'control', title: 'Make the workspace yours.', description: 'Control where Novi sits, how it looks, and how you interact with it.' },
] as const;
