import {
  Activity, ArrowDown, ArrowLeft, ArrowUp, Box, Calendar, ChevronDown, ChevronLeft, ChevronRight, Clock, X, Copy,
  Trash2, Download, ExternalLink, EyeOff, Eye, Filter, Globe, GripVertical, CircleHelp, Image, Layers, Maximize2,
  Mic, Minus, Ellipsis, ChartPie, Plus, RefreshCw, Save, Search, Server, Settings, Shield, ArrowUpDown, Type, Check,
  Upload, Video,
} from 'lucide-react';

const sizes = { 'extra-small': 12, small: 14, default: 16, large: 20, 'extra-large': 24 };
const icon = Glyph => function AdminIcon({ size, spin, className, ...props }) {
  return <Glyph {...props} size={sizes[size] ?? size ?? 16}
    className={['xa24-icon', spin && 'xa24-icon-spin', className].filter(Boolean).join(' ')}/>;
};

export const IconActivity = icon(Activity);
export const IconArrowDown = icon(ArrowDown);
export const IconArrowLeft = icon(ArrowLeft);
export const IconArrowUp = icon(ArrowUp);
export const IconBox = icon(Box);
export const IconCalendar = icon(Calendar);
export const IconChevronDown = icon(ChevronDown);
export const IconChevronLeft = icon(ChevronLeft);
export const IconChevronRight = icon(ChevronRight);
export const IconClock = icon(Clock);
export const IconClose = icon(X);
export const IconCopy = icon(Copy);
export const IconDelete = icon(Trash2);
export const IconDownload = icon(Download);
export const IconExternalOpenStroked = icon(ExternalLink);
export const IconEyeClosed = icon(EyeOff);
export const IconEyeOpened = icon(Eye);
export const IconFilter = icon(Filter);
export const IconGlobe = icon(Globe);
export const IconHandle = icon(GripVertical);
export const IconHelpCircle = icon(CircleHelp);
export const IconImageStroked = icon(Image);
export const IconLayers = icon(Layers);
export const IconMaximize = icon(Maximize2);
export const IconMicrophoneStroked = icon(Mic);
export const IconMinus = icon(Minus);
export const IconMore = icon(Ellipsis);
export const IconPieChart2Stroked = icon(ChartPie);
export const IconPlus = icon(Plus);
export const IconRefresh = icon(RefreshCw);
export const IconSave = icon(Save);
export const IconSearch = icon(Search);
export const IconServerStroked = icon(Server);
export const IconSetting = icon(Settings);
export const IconShield = icon(Shield);
export const IconSort = icon(ArrowUpDown);
export const IconTextStroked = icon(Type);
export const IconTick = icon(Check);
export const IconUpload = icon(Upload);
export const IconVideoStroked = icon(Video);
