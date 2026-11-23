import { createContext, useContext } from 'react';
import { channelEnglish } from './admin-english.mjs';

export { channelEnglish };
export const ChannelLanguageContext = createContext(false);
const chinese = label => label;
export const useChannelText = () => useContext(ChannelLanguageContext) ? channelEnglish : chinese;
