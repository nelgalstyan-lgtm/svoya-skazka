import fs from 'node:fs';
import { synthesize } from 'file:///C:/Users/Asus/svoya-skazka/worker/voice.js';
const env = Object.fromEntries(fs.readFileSync('C:/Users/Asus/svoya-skazka/server/.env','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim()]));
const lines = {
  n1: 'Алекс искал ошибку в задаче. А нашёл старую книгу с четырьмя таинственными знаками — и фотографией города, которого больше нет.',
  n2: 'Знаки вели в Ан+и — древнюю столицу Армении. Город тысячи и одной церкви.',
  n3: 'Лев на воротах. Крест на соборе. Розетка на камне. Алекс был уверен, что разгадал загадку.',
  n4: 'Но последний знак привёл его совсем не туда.',
  n5: 'Тайника не было. Была история целого города — и её нужно было сохранить.',
  n6: '«Алекс и тайна Ан+и» — мультфильм по книге, где главный герой — ваш ребёнок.'
};
for (const [k, t] of Object.entries(lines)) {
  fs.writeFileSync(`${process.argv[2]}/${k}.mp3`, await synthesize(env, t, 'neutral'));
  console.log(k, 'ok');
}
