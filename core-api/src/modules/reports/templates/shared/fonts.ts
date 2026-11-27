import { Font } from '@react-pdf/renderer';
import * as path from 'path';

const assetsDir = path.join(__dirname, 'assets');

Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(assetsDir, 'Inter-Regular.ttf'), fontWeight: 400 },
    { src: path.join(assetsDir, 'Inter-Medium.ttf'), fontWeight: 500 },
    { src: path.join(assetsDir, 'Inter-SemiBold.ttf'), fontWeight: 600 },
    { src: path.join(assetsDir, 'Inter-Bold.ttf'), fontWeight: 700 },
    { src: path.join(assetsDir, 'Inter-ExtraBold.ttf'), fontWeight: 800 },
  ],
});

Font.register({
  family: 'JetBrains Mono',
  fonts: [
    { src: path.join(assetsDir, 'JetBrainsMono-Regular.ttf'), fontWeight: 400 },
    { src: path.join(assetsDir, 'JetBrainsMono-Medium.ttf'), fontWeight: 500 },
  ],
});
