import { useState, useMemo } from "react";

export const useTeamFilters = (teams) => {
  const [sortOrder, setSortOrder] = useState("yes-desc"); // 'default', 'yes-desc', 'yes-asc'

  const filteredAndSortedTeams = useMemo(() => {
    let result = [...teams];
    const compareMostVotes = (a, b) =>
      b.nyes - a.nyes || b.nno - a.nno;

    switch (sortOrder) {
      case "yes-desc":
        result.sort(compareMostVotes);
        break;
      case "yes-asc":
        result.sort((a, b) => -compareMostVotes(a, b));
        break;
      default:
        break;
    }

    return result;
  }, [teams, sortOrder]);

  return {
    sortOrder,
    setSortOrder,
    filteredAndSortedTeams,
  };
};
