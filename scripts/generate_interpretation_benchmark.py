#!/usr/bin/env python3
"""Generate the deterministic candidate benchmark; never marks linguistic data reviewed."""

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Seed:
    category: str
    source: str
    malayalam: str
    gloss: tuple[str, ...]
    intent: str
    speech_act: str = "statement"
    tense: str = "present"
    aspect: tuple[str, ...] = ("simple",)
    modality: tuple[str, ...] = ()
    polarity: str = "affirmative"
    emotion: str = "neutral"
    voice: str = "active"


SEEDS = [
    Seed(
        "greetings",
        "Hello, welcome to our class.",
        "ഹലോ, ഞങ്ങളുടെ ക്ലാസിലേക്ക് സ്വാഗതം.",
        ("CLASS", "OUR", "WELCOME"),
        "welcome people to a class",
        "greeting",
    ),
    Seed(
        "greetings",
        "Good morning, everyone.",
        "എല്ലാവർക്കും സുപ്രഭാതം.",
        ("MORNING", "EVERYONE", "GREETING"),
        "greet everyone in the morning",
        "greeting",
    ),
    Seed(
        "greetings",
        "Thank you for helping me.",
        "എന്നെ സഹായിച്ചതിന് നന്ദി.",
        ("YOU", "ME", "HELP", "THANK-YOU"),
        "thank someone for help",
        "response",
        emotion="happy",
    ),
    Seed(
        "greetings",
        "It is nice to meet you.",
        "നിങ്ങളെ കണ്ടതിൽ സന്തോഷം.",
        ("YOU", "MEET", "HAPPY"),
        "express pleasure at meeting someone",
        "greeting",
        emotion="happy",
    ),
    Seed(
        "greetings",
        "See you tomorrow.",
        "നാളെ കാണാം.",
        ("TOMORROW", "YOU", "SEE"),
        "say goodbye with a plan to meet tomorrow",
        "greeting",
        tense="future",
    ),
    Seed(
        "conversation",
        "I am going home now.",
        "ഞാൻ ഇപ്പോൾ വീട്ടിലേക്ക് പോകുന്നു.",
        ("NOW", "I", "HOME", "GO"),
        "state current travel home",
        aspect=("progressive",),
    ),
    Seed(
        "conversation",
        "She said she would call later.",
        "അവൾ പിന്നീട് വിളിക്കുമെന്ന് പറഞ്ഞു.",
        ("SHE", "LATER", "CALL", "SAY"),
        "report a woman's future intention to call",
        tense="past",
        modality=("intention",),
    ),
    Seed(
        "conversation",
        "We have been waiting for an hour.",
        "ഞങ്ങൾ ഒരു മണിക്കൂറായി കാത്തിരിക്കുകയാണ്.",
        ("ONE-HOUR", "WE", "WAIT", "CONTINUE"),
        "state an ongoing one-hour wait",
        aspect=("perfect", "progressive"),
    ),
    Seed(
        "conversation",
        "Could you speak a little more slowly?",
        "കുറച്ച് കൂടി പതുക്കെ സംസാരിക്കാമോ?",
        ("YOU", "SPEAK", "SLOW", "REQUEST"),
        "politely request slower speech",
        "request",
        modality=("polite-request",),
    ),
    Seed(
        "conversation",
        "I forgot where I put the keys.",
        "താക്കോൽ എവിടെ വെച്ചെന്ന് ഞാൻ മറന്നു.",
        ("KEY", "WHERE", "PUT", "I", "FORGET"),
        "state forgetting the location of keys",
        tense="past",
    ),
    Seed(
        "education",
        "The teacher explained photosynthesis yesterday.",
        "അധ്യാപകൻ ഇന്നലെ പ്രകാശസംശ്ലേഷണം വിശദീകരിച്ചു.",
        ("YESTERDAY", "TEACHER", "PHOTOSYNTHESIS", "EXPLAIN"),
        "report a lesson about photosynthesis",
        tense="past",
    ),
    Seed(
        "education",
        "The students are reading chapter three.",
        "വിദ്യാർത്ഥികൾ മൂന്നാം അധ്യായം വായിക്കുകയാണ്.",
        ("STUDENT", "CHAPTER", "THREE", "READ"),
        "describe students reading chapter three",
        aspect=("progressive",),
    ),
    Seed(
        "education",
        "The exam starts next Monday.",
        "പരീക്ഷ അടുത്ത തിങ്കളാഴ്ച ആരംഭിക്കും.",
        ("NEXT", "MONDAY", "EXAM", "START"),
        "state the exam start date",
        tense="future",
    ),
    Seed(
        "education",
        "Submit the assignment before Friday.",
        "വെള്ളിയാഴ്ചയ്ക്ക് മുമ്പ് അസൈൻമെന്റ് സമർപ്പിക്കുക.",
        ("FRIDAY", "BEFORE", "ASSIGNMENT", "SUBMIT"),
        "instruct submission before Friday",
        "command",
        tense="future",
        modality=("obligation",),
    ),
    Seed(
        "education",
        "Water boils at one hundred degrees Celsius.",
        "വെള്ളം നൂറ് ഡിഗ്രി സെൽഷ്യസിൽ തിളയ്ക്കുന്നു.",
        ("WATER", "TEMPERATURE", "ONE-HUNDRED", "CELSIUS", "BOIL"),
        "state the boiling point of water",
    ),
    Seed(
        "technical",
        "The computer stores the data securely.",
        "കമ്പ്യൂട്ടർ ഡാറ്റ സുരക്ഷിതമായി സൂക്ഷിക്കുന്നു.",
        ("COMPUTER", "DATA", "SAFE", "STORE"),
        "explain secure data storage",
    ),
    Seed(
        "technical",
        "The update was installed automatically.",
        "അപ്ഡേറ്റ് സ്വയമേവ ഇൻസ്റ്റാൾ ചെയ്തു.",
        ("UPDATE", "AUTOMATIC", "INSTALL", "COMPLETE"),
        "report automatic update installation",
        tense="past",
        aspect=("completed",),
        voice="passive",
    ),
    Seed(
        "technical",
        "The network is not connecting.",
        "നെറ്റ്‌വർക്ക് കണക്റ്റ് ആവുന്നില്ല.",
        ("NETWORK", "CONNECT", "NOT"),
        "report a network connection failure",
        aspect=("progressive",),
        polarity="negative",
        emotion="concerned",
    ),
    Seed(
        "technical",
        "Click the button to save the document.",
        "ഡോക്യുമെന്റ് സേവ് ചെയ്യാൻ ബട്ടൺ ക്ലിക്ക് ചെയ്യുക.",
        ("DOCUMENT", "SAVE", "BUTTON", "CLICK"),
        "instruct how to save a document",
        "command",
    ),
    Seed(
        "technical",
        "Artificial intelligence can recognize patterns, but it can make mistakes.",
        "കൃത്രിമ ബുദ്ധിക്ക് പാറ്റേണുകൾ തിരിച്ചറിയാൻ കഴിയും, പക്ഷേ അതിന് തെറ്റുകൾ സംഭവിക്കാം.",
        (
            "ARTIFICIAL-INTELLIGENCE",
            "PATTERN",
            "RECOGNIZE",
            "CAN",
            "BUT",
            "MISTAKE",
            "POSSIBLE",
        ),
        "explain an AI capability and limitation",
        modality=("ability", "possibility"),
        polarity="mixed",
    ),
    Seed(
        "questions",
        "Where will the meeting be held?",
        "യോഗം എവിടെയാണ് നടക്കുക?",
        ("MEETING", "WHERE", "HAPPEN", "QUESTION"),
        "ask for the meeting location",
        "question",
        tense="future",
    ),
    Seed(
        "questions",
        "Why did you pause the video?",
        "നിങ്ങൾ വീഡിയോ നിർത്തിയത് എന്തുകൊണ്ട്?",
        ("VIDEO", "YOU", "PAUSE", "WHY", "QUESTION"),
        "ask why a video was paused",
        "question",
        tense="past",
    ),
    Seed(
        "questions",
        "Have you finished the assignment?",
        "നിങ്ങൾ അസൈൻമെന്റ് പൂർത്തിയാക്കിയോ?",
        ("ASSIGNMENT", "YOU", "FINISH", "QUESTION"),
        "ask whether an assignment is complete",
        "question",
        aspect=("perfect",),
    ),
    Seed(
        "questions",
        "Who shared the screen?",
        "സ്ക്രീൻ പങ്കുവെച്ചത് ആരാണ്?",
        ("SCREEN", "SHARE", "WHO", "QUESTION"),
        "ask who shared a screen",
        "question",
        tense="past",
    ),
    Seed(
        "questions",
        "When will the captions start?",
        "ക്യാപ്ഷനുകൾ എപ്പോൾ ആരംഭിക്കും?",
        ("CAPTION", "START", "WHEN", "QUESTION"),
        "ask when captions will start",
        "question",
        tense="future",
    ),
    Seed(
        "commands",
        "Please open your textbook.",
        "ദയവായി നിങ്ങളുടെ പാഠപുസ്തകം തുറക്കുക.",
        ("PLEASE", "YOUR", "TEXTBOOK", "OPEN"),
        "politely instruct opening a textbook",
        "command",
        modality=("polite-command",),
    ),
    Seed(
        "commands",
        "Do not close this window.",
        "ഈ വിൻഡോ അടയ്ക്കരുത്.",
        ("THIS", "WINDOW", "CLOSE", "NOT"),
        "prohibit closing a window",
        "command",
        polarity="negative",
    ),
    Seed(
        "commands",
        "Turn on the captions now.",
        "ഇപ്പോൾ ക്യാപ്ഷനുകൾ ഓൺ ചെയ്യുക.",
        ("NOW", "CAPTION", "TURN-ON"),
        "instruct enabling captions",
        "command",
    ),
    Seed(
        "commands",
        "Send the report after the review.",
        "അവലോകനത്തിന് ശേഷം റിപ്പോർട്ട് അയയ്ക്കുക.",
        ("REVIEW", "AFTER", "REPORT", "SEND"),
        "instruct sending a report after review",
        "command",
        tense="future",
    ),
    Seed(
        "commands",
        "Remember to mute your microphone.",
        "നിങ്ങളുടെ മൈക്രോഫോൺ മ്യൂട്ട് ചെയ്യാൻ ഓർക്കുക.",
        ("YOUR", "MICROPHONE", "MUTE", "REMEMBER"),
        "remind someone to mute a microphone",
        "command",
    ),
    Seed(
        "negation",
        "I do not understand this explanation.",
        "ഈ വിശദീകരണം എനിക്ക് മനസ്സിലാകുന്നില്ല.",
        ("THIS", "EXPLANATION", "I", "UNDERSTAND", "NOT"),
        "state lack of understanding",
        polarity="negative",
        emotion="concerned",
    ),
    Seed(
        "negation",
        "She has not joined the meeting yet.",
        "അവൾ ഇതുവരെ യോഗത്തിൽ ചേർന്നിട്ടില്ല.",
        ("SHE", "MEETING", "JOIN", "NOT-YET"),
        "state that a woman has not joined yet",
        aspect=("perfect",),
        polarity="negative",
    ),
    Seed(
        "negation",
        "We cannot use this file.",
        "ഈ ഫയൽ നമുക്ക് ഉപയോഗിക്കാൻ കഴിയില്ല.",
        ("THIS", "FILE", "WE", "USE", "CANNOT"),
        "state inability to use a file",
        modality=("inability",),
        polarity="negative",
    ),
    Seed(
        "negation",
        "This answer is not correct.",
        "ഈ ഉത്തരം ശരിയല്ല.",
        ("THIS", "ANSWER", "CORRECT", "NOT"),
        "state that an answer is incorrect",
        polarity="negative",
    ),
    Seed(
        "negation",
        "He never said that.",
        "അവൻ ഒരിക്കലും അങ്ങനെ പറഞ്ഞിട്ടില്ല.",
        ("HE", "THAT", "SAY", "NEVER"),
        "deny that a man ever made a statement",
        tense="past",
        polarity="negative",
    ),
    Seed(
        "emotion",
        "I am excited about the result.",
        "ഫലത്തെക്കുറിച്ച് എനിക്ക് വളരെ ആവേശമുണ്ട്.",
        ("RESULT", "I", "EXCITED"),
        "express excitement about a result",
        emotion="excited",
    ),
    Seed(
        "emotion",
        "She is worried about the deadline.",
        "അവൾ സമയപരിധിയെക്കുറിച്ച് ആശങ്കയിലാണ്.",
        ("DEADLINE", "SHE", "WORRIED"),
        "express a woman's concern about a deadline",
        emotion="concerned",
    ),
    Seed(
        "emotion",
        "We are sad that the meeting was cancelled.",
        "യോഗം റദ്ദാക്കിയതിൽ ഞങ്ങൾക്ക് ദുഃഖമുണ്ട്.",
        ("MEETING", "CANCEL", "WE", "SAD"),
        "express sadness about a cancelled meeting",
        tense="past",
        emotion="sad",
        voice="passive",
    ),
    Seed(
        "emotion",
        "He was surprised that the system worked.",
        "സിസ്റ്റം പ്രവർത്തിച്ചതിൽ അവൻ അതിശയിച്ചു.",
        ("SYSTEM", "WORK", "HE", "SURPRISED"),
        "express surprise that a system worked",
        tense="past",
        emotion="surprised",
    ),
    Seed(
        "emotion",
        "I am frustrated because the captions keep disappearing.",
        "ക്യാപ്ഷനുകൾ വീണ്ടും വീണ്ടും അപ്രത്യക്ഷമാകുന്നതിനാൽ എനിക്ക് നിരാശയുണ്ട്.",
        ("CAPTION", "REPEATED", "DISAPPEAR", "I", "FRUSTRATED"),
        "express frustration about disappearing captions",
        aspect=("habitual",),
        emotion="frustrated",
    ),
    Seed(
        "idioms",
        "Let us break the ice before the workshop.",
        "വർക്ക്‌ഷോപ്പിന് മുമ്പ് നമുക്ക് സൗഹൃദപരമായി സംഭാഷണം തുടങ്ങാം.",
        ("WORKSHOP", "BEFORE", "WE", "FRIENDLY", "CONVERSATION", "START"),
        "suggest starting a friendly conversation",
        "request",
        modality=("suggestion",),
    ),
    Seed(
        "idioms",
        "I am feeling under the weather today.",
        "ഇന്ന് എനിക്ക് സുഖമില്ല.",
        ("TODAY", "I", "UNWELL"),
        "state feeling unwell today",
        emotion="sad",
    ),
    Seed(
        "idioms",
        "This exercise is a piece of cake.",
        "ഈ അഭ്യാസം വളരെ എളുപ്പമാണ്.",
        ("THIS", "EXERCISE", "VERY", "EASY"),
        "state that an exercise is very easy",
        emotion="happy",
    ),
    Seed(
        "idioms",
        "You hit the nail on the head.",
        "നിങ്ങൾ കാര്യം കൃത്യമായി പറഞ്ഞു.",
        ("YOU", "POINT", "EXACT", "SAY"),
        "say that someone identified the exact point",
        "response",
        tense="past",
        emotion="happy",
    ),
    Seed(
        "idioms",
        "We visit that place once in a blue moon.",
        "ഞങ്ങൾ ആ സ്ഥലം വളരെ അപൂർവമായാണ് സന്ദർശിക്കുന്നത്.",
        ("THAT", "PLACE", "WE", "VISIT", "RARE"),
        "state that visits happen very rarely",
        aspect=("habitual",),
    ),
    Seed(
        "live-captions",
        "The next slide shows our results.",
        "അടുത്ത സ്ലൈഡിൽ ഞങ്ങളുടെ ഫലങ്ങൾ കാണിക്കുന്നു.",
        ("NEXT", "SLIDE", "OUR", "RESULT", "SHOW"),
        "describe the content of the next slide",
    ),
    Seed(
        "live-captions",
        "I mean, we were testing the camera.",
        "അതായത്, ഞങ്ങൾ ക്യാമറ പരീക്ഷിക്കുകയായിരുന്നു.",
        ("WE", "CAMERA", "TEST"),
        "correct the speaker reference and describe camera testing",
        tense="past",
        aspect=("progressive",),
    ),
    Seed(
        "live-captions",
        "Because the connection...",
        "കാരണം കണക്ഷൻ...",
        ("CONNECTION", "BECAUSE", "INCOMPLETE"),
        "preserve an incomplete causal fragment",
        speech_act="other",
        emotion="concerned",
    ),
    Seed(
        "live-captions",
        "The final report was approved by the committee.",
        "അന്തിമ റിപ്പോർട്ട് സമിതി അംഗീകരിച്ചു.",
        ("FINAL", "REPORT", "COMMITTEE", "APPROVE", "COMPLETE"),
        "report committee approval of the final report",
        tense="past",
        aspect=("completed",),
        voice="passive",
    ),
    Seed(
        "live-captions",
        "Ravi said he would send it, and Maya agreed.",
        "അത് അയയ്ക്കാമെന്ന് രവി പറഞ്ഞു, മായ സമ്മതിച്ചു.",
        ("RAVI", "IT", "SEND", "SAY", "MAYA", "AGREE"),
        "report Ravi's commitment and Maya's agreement",
        tense="past",
        modality=("intention",),
    ),
]

VARIANTS = (
    ("", "website"),
    ("Well, ", "youtube"),
    ("Um, ", "google-meet"),
    ("You know, ", "youtube"),
)


def generate() -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for seed_index, seed in enumerate(SEEDS, start=1):
        for variant_index, (prefix, platform) in enumerate(VARIANTS, start=1):
            source = (
                prefix + seed.source[0].lower() + seed.source[1:]
                if prefix
                else seed.source
            )
            is_fragment = seed.source.endswith("...")
            records.append(
                {
                    "id": f"quality-{seed_index:03d}-{variant_index}",
                    "category": seed.category,
                    "platform": platform,
                    "source": source,
                    "context": ["Current utterance is the evaluation target."],
                    "expected_semantics": {
                        "intent": seed.intent,
                        "speech_act": seed.speech_act,
                        "tense": seed.tense,
                        "aspect": list(seed.aspect),
                        "modality": list(seed.modality),
                        "polarity": seed.polarity,
                        "emotion": seed.emotion,
                        "voice": seed.voice,
                    },
                    "expected_malayalam_translation": seed.malayalam,
                    "expected_isl_gloss": list(seed.gloss),
                    "review_status": "candidate-native-review-required",
                    "metadata": {
                        "is_fragment": is_fragment,
                        "synthetic_variant": bool(prefix),
                    },
                }
            )
    return records


def main() -> int:
    output = Path("benchmarks/interpretation_quality.jsonl")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in generate()),
        encoding="utf-8",
    )
    print(f"Wrote {len(SEEDS) * len(VARIANTS)} benchmark cases to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
