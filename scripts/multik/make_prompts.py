HEAD = ("Cinematic stylized 3D animated film shot, 8 seconds, 16:9, exactly in the style of the attached reference images "
"(a modern animated feature film look, never photorealistic). Keep every character's face, hair and clothes identical to the references in every shot.\n"
"CHARACTERS: Alex - a teenage boy (a young teenager, not younger), face exactly as in the image alex-lico: oval slightly long face, narrow chin, "
"almond-shaped dark-brown eyes with slightly heavy lids, straight nose, small mole on his right cheek, ears that stick out a little, short messy dark-brown hair "
"with a fringe; dark-green hoodie, dark jeans. Max - his little brother, a preschooler: straight light-brown hair with bangs, round cheerful face, olive-green "
"sweatshirt with light stripes on the sleeves. Mom - a woman in her late thirties with dark-brown shoulder-length hair, warm brown eyes and a kind smile, black top.\n"
"VOICES (always exactly the same in every shot): Alex - Russian, the voice of a teenage boy: clear, light, not yet deep, calm and a little ironic, "
"natural unhurried pace. Max - Russian, the voice of a preschool little boy: high, bright, cheerful, excited, clear child pronunciation. "
"Mom - Russian, a warm, calm, soft female voice of a woman in her late thirties, slightly amused.\n"
"RULES: all speech is in Russian only, exactly the words given below and nothing else. Each line is spoken only by the named character, lips in sync. "
"No narrator, no music, no subtitles, no text on screen. Quiet natural ambient sounds under the voices.\n")

clips = [
 ("Математика", "uroki.png, alex-lico.png",
  "Evening in a cozy room with bookshelves. Alex sits at a wooden desk over a math notebook, frowns at the page and taps his pencil.\n"
  "Alex (sighing): \"Опять неправильно.\"\nMax leans over his shoulder and says brightly, very sure of himself:\nMax: \"Тогда начни сначала!\"\n"
  "Warm lamp light, slow push-in. Ambient: pencil tapping, a clock ticking."),
 ("Мама зовёт", "uroki.png, alex-lico.png",
  "Same room as in the reference image uroki. ONLY Alex and Max are in the frame. Mom is NEVER visible anywhere in this shot: not in the window, not in the doorway, not in the background, not as a reflection - she is only heard as a voice from another room. The window shows only the sky and the landscape outside.\n"
  "Max wears EXACTLY the same clothes as in the reference image uroki: the same olive-green sweatshirt with light stripes on the sleeves and the same print on the chest, blue jeans - do not change his clothes. "
  "A calm, quiet evening scene - no crash, no knocking, no loud noises, nothing dramatic.\n"
  "First 3 seconds: complete silence from the boys - nobody speaks, mouths closed. Both boys calmly look up from the notebook and turn their heads toward the door, as if someone called them from another room.\n"
  "Then only Alex speaks, looking toward the door, with a small sigh:\nAlex: \"Иду.\"\n"
  "This is the only line in the whole shot; Max says nothing. Alex puts down the pencil, Max calmly slides off his chair. The camera stays on the boys at the desk. Ambient: a quiet room, a clock ticking."),
 ("Странная книга", "kniga-lev.png, mama-ruiny.png, alex-lico.png",
  "A living room full of open cardboard boxes, old photos and letters on the floor, sunset light from the window. Mom kneels by a box and hands Alex a small dark leather book with a lion on the cover.\n"
  "Alex: \"Это что?\"\nMom: \"Нашла в старых вещах.\"\nAlex takes the book carefully. Ambient: paper rustling."),
 ("Каменный лев", "kniga-lev.png, uroki.png, alex-lico.png",
  "Close-up: Alex runs his finger over the lion pressed into the leather cover. Little Max squeezes in next to him, eyes wide.\n"
  "Max: \"Он настоящий?\"\nAlex: \"Каменный.\"\nMax (nodding seriously): \"Значит, не настоящий.\"\nGentle camera movement, warm light."),
 ("Четыре знака", "znaki.png, alex-lico.png",
  "Alex opens the book. Close-ups of old pages with four drawings: a lion, a cross, a round flower-like rosette, an eight-pointed star. Then Alex's face, thoughtful.\n"
  "Alex (slowly, almost to himself): \"Лев. Крест. Розетка. Звезда. Это что-то означает.\"\nAmbient: pages turning."),
 ("Дорога", "doroga.png, alex-lico.png",
  "Exactly the scene of the reference image doroga: a winding mountain road at sunset, the stone milestone, the castle on the hill, the river valley below. "
  "The car is EXACTLY the same car as in the reference image doroga: a plain white four-door sedan of the same shape, seen from the side as in the reference - do not change it into another model or brand. "
  "No license plates are visible at all, no logos, no badges, no letters or numbers on the car. Keep the camera on the side of the car, never behind it.\n"
  "Alex stands by the open car door holding the book, looking into the distance. Mom speaks from inside the car (off-screen, not visible).\n"
  "Mom (off-screen): \"Через Грузию, потом Карс - и мы в Ани.\"\nAlex (quietly, smiling): \"Я готов.\"\nSlow gentle camera move, no cut. Ambient: wind, distant engine."),
 ("А где город?", "vorota.png, uroki.png, alex-lico.png",
  "Wide view: long ancient stone walls of Ani in tall golden grass, wind moving the grass. Max presses close to Alex and looks around, puzzled.\n"
  "Max: \"А где город?\"\nAlex (pointing at the walls): \"Вот.\"\nMax: \"Это стены.\"\nAlex opens his mouth to argue, then just smiles. Ambient: wind."),
 ("Львиные ворота", "vorota.png, alex-lico-bez-vorot.png",
  "The ancient stone gate of Ani exactly as in the first frame of the reference image vorota: massive stone walls and a rectangular passage. "
  "On the wall there is ONE small carved stone lion - a single lion in low relief, the only carving, the same through the whole shot. "
  "There is no second lion, no column, no triangular relief - nothing like the Lion Gate of Mycenae. "
  "Single continuous shot at eye level: the camera does not rise or zoom in on the carving, no cuts. The gate and the carving never change.\n"
  "Alex walks up to the gate, stops, looks from the book in his hands to the small lion on the wall.\n"
  "Alex (excited, quietly): \"Первый знак!\"\nMom (off-screen, warmly): \"Львиные ворота.\"\nGolden sunset light. Ambient: wind, birds."),
 ("Собор", "mama-ruiny.png, alex-lico.png",
  "A huge ruined medieval Armenian cathedral of reddish stone in the steppe. Alex compares a drawing of a cross in the book with the building. Mom stands next to him.\n"
  "Alex: \"Второй знак. Они оставили знаки специально для нас!\"\nMom (amused): \"Вряд ли строители рассчитывали на тебя.\"\nAmbient: wind."),
 ("Розетка или цветочек", "rozetka.png, alex-lico.png",
  "Sunset in the ruins. Alex and little Max crouch by a stone with a carved rosette. Alex touches the carving.\n"
  "Alex (thoughtfully): \"Это розетка. Как в книге.\"\nMax (pointing, laughing loudly): \"Нет! Это цветочек!\"\nClose-up of the rosette, then their faces. Ambient: wind, distant birds."),
 ("Последний знак", "cerkov.png, alex-lico.png",
  "A small ancient stone church on a hill at sunset. Alex, with a backpack and the book in his hand, looks up at it, then turns and walks fast toward the horizon, full of confidence.\n"
  "Alex: \"Осталась звезда. Я знаю, куда идти!\"\nCamera follows him. Ambient: footsteps on gravel, wind."),
 ("Ошибка", "znaki.png, mama-ruiny.png, alex-lico.png",
  "Alex stops at the edge of a steep cliff above a river gorge, confused, looking at the book. The sky gets darker and windy. Mom and Max catch up with him.\n"
  "Mom: \"Алекс.\"\nAlex (embarrassed): \"Я знаю. Это была плохая идея.\"\nMax (happily): \"Зато приключение!\"\nAmbient: strong wind."),
 ("Настоящий город", "mama-ruiny.png, alex-lico.png",
  "Alex sits on a stone among the ruins. Max holds a dry blade of grass and looks at the walls.\n"
  "Max: \"Тут раньше жили дети?\"\nAlex (softly): \"Конечно.\"\nMax (seriously): \"Тогда это был настоящий город.\"\nAlex smiles. Golden light. Ambient: wind in the grass."),
 ("Старая фотография", "kniga-lev.png, alex-lico.png",
  "Close-up: Alex opens the last page of the book and finds an old black-and-white photograph of the same city. He turns it over and reads the handwriting on the back.\n"
  "Alex (reading slowly, quietly): \"Поэтому... записывай.\"\nHe looks up, thoughtful. Ambient: paper, wind."),
 ("То, что остаётся", "mama-ruiny.png, alex-lico.png",
  "Sunset over the ruins of Ani. Alex, Mom and Max sit together and look at the old city. Alex closes the book and smiles.\n"
  "Alex: \"Тайника нет. Зато здесь жили люди.\"\nMom (gently): \"Вот это и запиши.\"\nThe camera slowly pulls back and rises over the ruins. Ambient: wind, birds."),
]

out = ["МУЛЬТИК «АЛЕКС И ТАЙНА АНИ» — 2 МИНУТЫ (15 клипов по 8 секунд)",
       "Google Flow → Veo 3.1 Fast, 16:9, «Ingredients to Video» (картинки-ингредиенты — из папки kartinki).",
       "Каждый PROMPT ниже уже полный (с общим началом): копировать от строки после «PROMPT:» до следующей линии «====» и вставлять одним куском.",
       "Готовые клипы сохранять в папку klipy: klip-01.mp4 … klip-15.mp4.", ""]
for i, (t, imgs, scene) in enumerate(clips, 1):
    out += ["=" * 70, f"КЛИП {i:02d} — {t}", f"Картинки-ингредиенты: {imgs}", "PROMPT:", HEAD + "SHOT: " + scene, ""]
out += ["=" * 70, "ЕСЛИ ЧТО-ТО НЕ ТАК (дописать в конец промпта и сгенерировать ещё раз — не больше 2 раз на клип):",
        "• Говорит не тот герой → \"Only the named character speaks each line, one after another.\"",
        "• Голос Макса взрослый или писклявый → \"Max sounds like a real preschooler: soft, natural, not squeaky.\"",
        "• Алекс выглядит младше → \"Alex must look like a young teenager, as in alex-lico, not younger.\"",
        "• Появились субтитры или музыка → \"No subtitles. No music.\"",
        "• Неправильное ударение → просто сгенерировать ещё раз; если опять — записать слово в отчёт."]
open('C:/Users/Asus/Desktop/multik-alex/prompty-2min.txt', 'w', encoding='utf-8-sig').write("\n".join(out))
print(len(clips))
redo = [2, 6, 8]
r = ["ПЕРЕДЕЛКА КЛИПОВ 02, 06, 08 — Veo 3.1 Fast, 16:9, Ingredients to Video. Картинки — из папки kartinki.",
     "02 — мама была видна в окне, потом её реплику сказал Алекс и был грохот (теперь спокойно: только мамин голос из другой комнаты); 06 — другая машина и номер с буквами; 08 — рельеф менялся на двух львов с колонной.",
     "В клипе 08 вместо alex-lico.png — alex-lico-bez-vorot.png (на обложке за Алексом ворота с двумя львами — модель брала рельеф оттуда).",
     "Готовые сохранить в klipy под теми же именами (klip-02.mp4, klip-06.mp4, klip-08.mp4); старые я перенесу в staroe.", ""]
for i in redo:
    t, imgs, scene = clips[i - 1]
    r += ["=" * 70, f"КЛИП {i:02d} — {t}", f"Картинки-ингредиенты: {imgs}", "PROMPT:", HEAD + "SHOT: " + scene, ""]
open('C:/Users/Asus/Desktop/multik-alex/peredelka-02-06-08.txt', 'w', encoding='utf-8-sig').write("\n".join(r))
# Клип 02 (4-я версия): мама молчит, её голос — отдельным клипом 02-golos, звук накладывается при монтаже
c2 = clips[1]
golos = ("Mom in a living room full of open cardboard boxes, old photos on the floor, evening light. She stands by the boxes, turns toward the doorway "
         "and calmly, warmly calls her sons, who are in another room. Only Mom is in the frame and only Mom speaks:\n"
         "Mom: \"Алекс! Макс!\"\n"
         "Then she smiles and goes back to the boxes. Calm, quiet scene, no loud noises. Ambient: a quiet room.")
r = ["КЛИП 02 — Мама зовёт (4-я версия). Veo 3.1 Fast, 16:9, Ingredients to Video.",
     "Мама в клипе 02 молчит: Flow всё время отдавал её слова мальчикам. Её «Алекс! Макс!» берём из отдельного клипа 02-golos и накладываем при монтаже (Claude).",
     "Сделать ДВА клипа: klip-02.mp4 и klip-02-golos.mp4 (из второго нужен только звук).", "",
     "=" * 70, "КЛИП 02 — мальчики слышат маму, Алекс отвечает «Иду»", f"Картинки-ингредиенты: {c2[1]}", "PROMPT:", HEAD + "SHOT: " + c2[2], "",
     "=" * 70, "КЛИП 02-golos — мама зовёт (нужен только голос)", "Картинки-ингредиенты: mama-ruiny.png", "PROMPT:", HEAD + "SHOT: " + golos, ""]
open('C:/Users/Asus/Desktop/multik-alex/peredelka-02.txt', 'w', encoding='utf-8-sig').write("\n".join(r))
# Клип 02 (5-я версия): в общем начале была мама — Veo вставлял её в кадр и придумывал реплики («пора ужинать»).
# Для 02 — своё начало без мамы; Алекс говорит «Иду» сразу, мамин голос «Алекс! Макс!» — в конце клипа 01 при монтаже.
HEAD_NO_MOM = (HEAD.split("Mom - a woman")[0].rstrip() + "\n"
               + "VOICES: Alex - Russian, the voice of a teenage boy: clear, light, not yet deep, calm and a little ironic.\n"
               + "RULES: only two characters exist in this shot - Alex and Max. Nobody else appears or speaks, no adults, no voices from off-screen. "
               + "The only spoken word in the whole shot is Alex's line below; nobody says anything else. No narrator, no music, no subtitles, no text on screen.\n")
shot02 = ("The same room as in the reference image uroki: the desk, the notebook, the bookshelves, the window with the church. Only Alex and Max are in the frame. "
          "Max wears EXACTLY the same clothes as in the reference image uroki: the same olive-green sweatshirt with light stripes on the sleeves and the same print on the chest, blue jeans.\n"
          "At the very start of the shot Alex lifts his head, looks toward the door and says calmly, with a small sigh:\n"
          "Alex: \"Иду.\"\n"
          "Then, in silence, Alex puts down the pencil and stands up, and Max quietly slides off his chair. Nobody speaks after that. "
          "Calm, quiet evening, warm lamp light, the camera stays on the boys. Ambient: a quiet room, a clock ticking.")
r = ["КЛИП 02 — Мама зовёт (5-я версия). Veo 3.1 Fast, 16:9, Ingredients to Video.",
     "Мамы в этом клипе нет вообще. Её голос «Алекс! Макс!» Claude наложит при монтаже в конце клипа 01 — из клипа 02-golos.",
     "Сделать ДВА клипа: klip-02.mp4 и klip-02-golos.mp4 (из второго нужен только звук).", "",
     "=" * 70, "КЛИП 02 — Алекс отвечает «Иду»", "Картинки-ингредиенты: uroki.png, alex-lico.png", "PROMPT:", HEAD_NO_MOM + "SHOT: " + shot02, "",
     "=" * 70, "КЛИП 02-golos — мама зовёт (нужен только голос)", "Картинки-ингредиенты: mama-ruiny.png", "PROMPT:", HEAD + "SHOT: " + golos, ""]
open('C:/Users/Asus/Desktop/multik-alex/peredelka-02.txt', 'w', encoding='utf-8-sig').write("\n".join(r))
clips[1] = (clips[1][0], "uroki.png, alex-lico.png", shot02)
# общий файл: клип 02 — без мамы в начале промпта
g = open('C:/Users/Asus/Desktop/multik-alex/prompty-2min.txt', encoding='utf-8-sig').read()
a = g.index('КЛИП 02 —'); b = g.index('=' * 70, a)
g = g[:a] + "КЛИП 02 — Алекс отвечает «Иду» (мамин голос — при монтаже)\nКартинки-ингредиенты: uroki.png, alex-lico.png\nPROMPT:\n" + HEAD_NO_MOM + "SHOT: " + shot02 + "\n\n" + g[b:]
open('C:/Users/Asus/Desktop/multik-alex/prompty-2min.txt', 'w', encoding='utf-8-sig').write(g)
# Клип 08 (3-я версия): ворота — ТОЧНО как на книжной картинке vorota (два льва у колонны в треугольном камне над перемычкой);
# в 1-й версии во второй половине клипа рельеф менялся (львы вырастали и вставали на перемычку).
shot08 = ("The gate is EXACTLY the gate from the reference image vorota and stays identical in every frame of the shot: massive stone blocks, a rectangular passage "
          "with a heavy stone lintel, and above the lintel a triangular carved stone with two lions standing face to face on both sides of a central column - "
          "the same flat low relief, the same size, the same position, carved into the wall. Never change, enlarge, move or redesign the carving; "
          "the lions never turn into statues and never stand on top of the lintel.\n"
          "One continuous shot, no cuts: the camera stays at Alex's eye level and slowly moves along with him; it does not rise up to the carving and does not zoom in on it.\n"
          "Alex walks up to the gate, stops, looks from the book in his hands up to the carved lions.\n"
          "Alex (excited, quietly): \"Первый знак!\"\nMom (off-screen, warmly): \"Львиные ворота.\"\nGolden sunset light, the same sky and hills as in the reference. Ambient: wind, birds.")
r = ["КЛИП 08 — Львиные ворота (3-я версия). Veo 3.1 Fast, 16:9, Ingredients to Video.",
     "Ворота — точно как на картинке vorota.png (два льва у колонны), без изменений до конца клипа.", "",
     "=" * 70, "КЛИП 08 — Львиные ворота", "Картинки-ингредиенты: vorota.png, alex-lico-bez-vorot.png", "PROMPT:", HEAD + "SHOT: " + shot08, ""]
open('C:/Users/Asus/Desktop/multik-alex/peredelka-08.txt', 'w', encoding='utf-8-sig').write("\n".join(r))
g = open('C:/Users/Asus/Desktop/multik-alex/prompty-2min.txt', encoding='utf-8-sig').read()
a = g.index('КЛИП 08 —'); b = g.index('=' * 70, a)
g = g[:a] + "КЛИП 08 — Львиные ворота\nКартинки-ингредиенты: vorota.png, alex-lico-bez-vorot.png\nPROMPT:\n" + HEAD + "SHOT: " + shot08 + "\n\n" + g[b:]
open('C:/Users/Asus/Desktop/multik-alex/prompty-2min.txt', 'w', encoding='utf-8-sig').write(g)
# 3-й круг правок (08.10): 03 — две мамы; 07 — непонятно и «Это стены» дважды; 14 — «Поэтому записывай» без смысла
shot03 = ("The same living room as in the reference image mama-gostinaya: open cardboard boxes, old photos on the floor, a sofa, warm sunset light from the window. "
          "Exactly TWO people are in the frame: ONE woman - Mom, exactly as in mama-gostinaya (there is only one Mom, never two women, no copies) - and Alex. "
          "Max is not in this shot.\n"
          "Mom kneels by a box, takes out a small dark leather book with a lion on the cover and holds it out to Alex.\n"
          "First Alex asks, looking at the book:\nAlex: \"Это что?\"\n"
          "Then Mom answers:\nMom: \"Нашла в старых вещах.\"\n"
          "Alex takes the book carefully. Each line is said exactly once, in this order. Ambient: paper rustling.")
shot07 = ("Clear and simple, one continuous shot. Alex and little Max stand together on a path in front of long ruined stone walls of an ancient city, tall golden grass around, "
          "evening light, the walls are the only thing left of the city. Max looks around in surprise - he expected houses and streets.\n"
          "Max (puzzled): \"А где город?\"\n"
          "Alex points at the walls:\nAlex: \"Вот он.\"\n"
          "Max looks at the walls, then at Alex, and shrugs:\nMax: \"Это же просто стены.\"\n"
          "Alex smiles. Each line is said exactly once, in this order; nobody repeats a line and nobody says anything else. Ambient: wind in the grass.")
shot14 = ("Close-up in warm sunset light among the ruins: Alex opens the last page of the old book and finds an old black-and-white photograph of the same ruined city, "
          "taken about a hundred years ago. He looks at it with wonder:\n"
          "Alex: \"Это Ани. Сто лет назад.\"\n"
          "He turns the photo over: on the back there is old handwriting. He reads it aloud, slowly:\n"
          "Alex: \"Останется не всё. Поэтому записывай.\"\n"
          "He looks up at the ruins, thoughtful. Each line is said exactly once. Ambient: wind, paper.")
fix = {3: ("Странная книга", "mama-gostinaya.png, kniga-lev.png, alex-lico.png", shot03),
       7: ("А где город?", "vorota.png, uroki.png, alex-lico-bez-vorot.png", shot07),
       14: ("Старая фотография", "kniga-lev.png, alex-lico.png", shot14)}
r = ["ПЕРЕДЕЛКА КЛИПОВ 03, 07, 14 — Veo 3.1 Fast, 16:9, Ingredients to Video. Картинки — из папки kartinki.",
     "03 — в кадре было две мамы (теперь образец мамы — mama-gostinaya.png, кадр из удачной маминой сцены; Макса в этом клипе нет);",
     "07 — сцена была непонятной и «Это стены» звучало дважды; 14 — «Поэтому записывай» без смысла (теперь Алекс видит фото Ани сто лет назад и читает надпись).",
     "Готовые сохранить в klipy под теми же именами: klip-03.mp4, klip-07.mp4, klip-14.mp4.", ""]
g = open('C:/Users/Asus/Desktop/multik-alex/prompty-2min.txt', encoding='utf-8-sig').read()
for i, (t, imgs, shot) in fix.items():
    block = f"КЛИП {i:02d} — {t}\nКартинки-ингредиенты: {imgs}\nPROMPT:\n" + HEAD + "SHOT: " + shot + "\n"
    r += ["=" * 70, block]
    a = g.index(f'КЛИП {i:02d} —'); b = g.index('=' * 70, a)
    g = g[:a] + block + "\n" + g[b:]
open('C:/Users/Asus/Desktop/multik-alex/prompty-2min.txt', 'w', encoding='utf-8-sig').write(g)
open('C:/Users/Asus/Desktop/multik-alex/peredelka-03-07-14.txt', 'w', encoding='utf-8-sig').write("\n".join(r))
# Финал из книги (08.10): дорога домой, тетрадь «АНИ», «А про Армению?», последняя строка «А там жили люди».
HEAD_BOYS = (HEAD.split("Mom - a woman")[0].rstrip() + "\n"
             + "VOICES (always exactly the same in every shot): Alex - Russian, the voice of a teenage boy: clear, light, not yet deep, calm and a little ironic, natural unhurried pace. "
             + "Max - Russian, the voice of a preschool little boy: high, bright, cheerful, clear child pronunciation.\n"
             + "RULES: only Alex and Max are visible and only they speak - no adults in the frame, no other voices. All speech is in Russian only, exactly the words given below, "
             + "each line exactly once, in this order, and nothing else is said. Lips in sync. No narrator, no music, no subtitles, no text or letters on screen; "
             + "the notebook pages show only unreadable handwriting lines. Quiet natural ambient sounds.\n")
car = ("Inside a white car driving home along a mountain road at golden sunset, warm light through the windows. Alex and Max sit together on the back seat; "
       "Max wears exactly the same clothes as in the reference image uroki. The mountains and a river gorge slide past the window. ")
finale = [
 ("16", "Дорога домой", "uroki.png, alex-lico-bez-vorot.png, doroga.png",
  car + "Alex has a school notebook on his knees and writes in it with a pencil, thoughtful. Max leans over his shoulder to look.\n"
  "Max (curious): \"Что ты пишешь?\"\nAlex (without looking up, calmly): \"Про Ани.\"\n"
  "Max: \"Про льва?\"\nAlex (smiling): \"И про льва.\"\nSlow gentle camera, close two-shot. Ambient: soft car engine, road."),
 ("17", "А про Армению?", "uroki.png, alex-lico-bez-vorot.png, doroga.png",
  car + "Max thinks for a second and asks seriously:\n"
  "Max: \"А про Армению?\"\n"
  "Alex stops writing, slowly turns to the window and looks at the river gorge and the mountains on the other side for a moment, then turns back to Max and says warmly:\n"
  "Alex: \"Конечно.\"\nSlow push-in on Alex's face, the sunset light on it. Ambient: soft car engine."),
 ("18", "А там жили люди", "uroki.png, alex-lico-bez-vorot.png, doroga.png",
  car + "Close-up: Alex writes one last line in the notebook (the handwriting is not readable) and reads it aloud quietly, with a small smile:\n"
  "Alex: \"А там жили люди.\"\n"
  "He closes the notebook and leans his head against the window. Max has fallen asleep on his shoulder. "
  "The camera slowly pulls back out of the car window to a wide view of the car on the mountain road at sunset. Ambient: soft engine, wind."),
]
r = ["ФИНАЛ ИЗ КНИГИ — 3 новых клипа (16, 17, 18). Veo 3.1 Fast, 16:9, Ingredients to Video. Картинки — из папки kartinki.",
     "Мамы в кадре нет (она за кадром ведёт машину) — так Flow не перепутает голоса. Ставим после клипа 15, перед титрами.",
     "Готовые сохранить в klipy: klip-16.mp4, klip-17.mp4, klip-18.mp4.",
     "Если появятся надписи в тетради или на экране — дописать в конец промпта: \"No readable text anywhere.\"", ""]
for n, t, imgs, shot in finale:
    r += ["=" * 70, f"КЛИП {n} — {t}", f"Картинки-ингредиенты: {imgs}", "PROMPT:", HEAD_BOYS + "SHOT: " + shot, ""]
open('C:/Users/Asus/Desktop/multik-alex/final-16-17-18.txt', 'w', encoding='utf-8-sig').write("\n".join(r))
