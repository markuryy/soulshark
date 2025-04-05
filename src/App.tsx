import { Button } from "@/components/ui/button";
import { Home, Heart, Library, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import SoulSharkLogo from "@/components/logo";

function App() {
  const [currentProgress, setCurrentProgress] = useState(0);

  return (
    <div className="min-h-screen h-full bg-black text-white overflow-auto">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-60 bg-black p-6 flex flex-col gap-6 fixed h-screen">
          <div className="flex items-center gap-2 mb-2">
            <SoulSharkLogo className="h-8 w-8 mr-2https://context7.com/tauri/llm.txt?topic=store" />
            <span className="text-xl font-bold">soulshark</span>
          </div>
          <div className="space-y-4">
            <Button variant="ghost" className="w-full justify-start text-lg font-semibold">
              <Home className="mr-3 h-5 w-5" />
              Home
            </Button>
            <Button variant="ghost" className="w-full justify-start text-lg font-semibold">
              <Heart className="mr-3 h-5 w-5" />
              Liked
            </Button>
            <Button variant="ghost" className="w-full justify-start text-lg font-semibold">
              <Library className="mr-3 h-5 w-5" />
              Your Library
            </Button>
            <Button variant="ghost" className="w-full justify-start text-lg font-semibold">
              <Settings className="mr-3 h-5 w-5" />
              Settings
            </Button>
          </div>

          <div className="mt-4 border-t border-gray-800 pt-4">
            <h2 className="mb-4 px-3 text-sm font-semibold uppercase text-gray-400">PLAYLISTS</h2>
            <div className="space-y-2">
              <Button variant="ghost" className="w-full justify-start">2021 Greatest Songs</Button>
              <Button variant="ghost" className="w-full justify-start">At Work</Button>
              <Button variant="ghost" className="w-full justify-start">Playlist #2</Button>
              <Button variant="ghost" className="w-full justify-start">Playlist #4</Button>
              <Button variant="ghost" className="w-full justify-start">RapCaviar</Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-gradient-to-b from-gray-900 to-black min-h-screen ml-60">
          {/* Top Bar */}
          <div className="fixed top-0 left-60 right-0 flex items-center px-6 h-[72px] bg-black/50 backdrop-blur-sm z-10">
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="bg-black/60 rounded-full">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="bg-black/60 rounded-full">
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Content Grid */}
          <div className="p-6 mt-[72px]">
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-6">From Artists You Like</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {[
                  { title: 'Be Happy', artist: 'Gene Evaro Jr.' },
                  { title: 'Some Days', artist: 'Ira Wolf' },
                  { title: 'Chime', artist: 'Alan Gogoll' },
                  { title: 'Runaway', artist: 'Beast Coast' },
                  { title: 'In Your Car', artist: 'No Aloha' }
                ].map((item) => (
                  <div key={item.title} className="bg-gray-800/30 p-3 rounded-lg hover:bg-gray-800/50 transition group">
                    <div className="aspect-square bg-gray-700 rounded mb-3"></div>
                    <h3 className="font-semibold truncate text-sm">{item.title}</h3>
                    <p className="text-xs text-gray-400 truncate">{item.artist}</p>
                    <Button 
                      variant="secondary" 
                      size="icon" 
                      className="opacity-0 group-hover:opacity-100 transition bg-green-500 hover:bg-green-400 h-8 w-8 rounded-full mt-2 shadow-lg"
                    >
                      ↓
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-6">Your Playlists</h2>
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[
                  { title: '2021 Greatest Songs', description: 'Your top tracks from 2021' },
                  { title: 'At Work', description: 'Focus and productivity mix' },
                  { title: 'Playlist #2', description: 'Your custom collection' },
                  { title: 'RapCaviar', description: 'Hip-hop essentials' }
                ].map((playlist) => (
                  <div key={playlist.title} className="bg-gray-800/30 p-3 rounded-lg hover:bg-gray-800/50 transition group">
                    <div className="aspect-square bg-gray-700 rounded mb-3"></div>
                    <h3 className="font-semibold truncate text-sm">{playlist.title}</h3>
                    <p className="text-xs text-gray-400 truncate">{playlist.description}</p>
                    <Button 
                      variant="secondary" 
                      size="icon" 
                      className="opacity-0 group-hover:opacity-100 transition bg-green-500 hover:bg-green-400 h-8 w-8 rounded-full mt-2 shadow-lg"
                    >
                      ↓
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
