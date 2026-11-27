// Show the latest public repository commit and its timestamp in the page footer.
(() => {
    const idNode = document.getElementById('commit-id');
    const timeNode = document.getElementById('commit-time');
    if (!idNode || !timeNode) return;

    fetch('https://api.github.com/repos/CitrusCryptid/AnatomyGame/commits?per_page=1', {
        headers: { Accept: 'application/vnd.github+json' }
    })
        .then((response) => {
            if (!response.ok) throw new Error('Commit lookup failed');
            return response.json();
        })
        .then((commits) => {
            const latest = commits[0];
            const committedAt = latest?.commit?.committer?.date || latest?.commit?.author?.date;
            if (!latest?.sha || !committedAt) throw new Error('Commit data is incomplete');

            idNode.textContent = `#${latest.sha.slice(0, 7)}`;
            const date = new Date(committedAt);
            timeNode.dateTime = date.toISOString();
            timeNode.textContent = date.toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
            timeNode.title = `Committed ${date.toISOString()}`;
        })
        .catch(() => {
            idNode.textContent = 'unavailable';
            timeNode.textContent = 'Could not load commit date';
        });
})();
