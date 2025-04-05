import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SpotifySearchProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

export default function SpotifySearch({ onSearch, isLoading = false }: SpotifySearchProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center space-x-2 mb-4">
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search Spotify..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 bg-gray-800 border-gray-700 text-white"
        />
      </div>
      <Button 
        type="submit" 
        size="sm" 
        disabled={isLoading || !searchQuery.trim()}
        className="bg-green-600 hover:bg-green-700"
      >
        {isLoading ? "Searching..." : "Search"}
      </Button>
    </form>
  );
}
