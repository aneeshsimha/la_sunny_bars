import { create } from "zustand";

function isTodayDate(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

interface TimeState {
  selectedDate: Date;
  sliderValue: number;
  sunrise: Date;
  sunset: Date;
  currentTime: Date;
  isPlaying: boolean;
  isLiveMode: boolean;
  isPlanningMode: boolean;
  setSelectedDate: (date: Date) => void;
  setSliderValue: (value: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsLiveMode: (live: boolean) => void;
  setPlanningMode: (v: boolean) => void;
  setSunTimes: (sunrise: Date, sunset: Date) => void;
  setCurrentTime: (time: Date) => void;
}

export const useTimeStore = create<TimeState>((set) => ({
  selectedDate: new Date(),
  sliderValue: 0,
  sunrise: new Date(),
  sunset: new Date(),
  currentTime: new Date(),
  isPlaying: false,
  isLiveMode: true,
  isPlanningMode: false,
  setSelectedDate: (date) =>
    set({ selectedDate: date, isPlanningMode: !isTodayDate(date) }),
  setSliderValue: (value) => set({ sliderValue: value }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setIsLiveMode: (live) => set({ isLiveMode: live }),
  setPlanningMode: (v) => set({ isPlanningMode: v }),
  setSunTimes: (sunrise, sunset) => set({ sunrise, sunset }),
  setCurrentTime: (time) => set({ currentTime: time }),
}));
