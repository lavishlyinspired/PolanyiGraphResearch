from polanyi.execution.gds_tools import (
    format_communities,
    format_page_rank,
    format_similar_terms,
)


# ── format_page_rank ──────────────────────────────────────────────


def test_format_page_rank_resolves_real_names_and_ranks_descending():
    rows = [{"nodeId": 1, "score": 0.5}, {"nodeId": 2, "score": 0.9}]
    names = {1: "trades", 2: "Counterparty"}
    result = format_page_rank(rows, names, top_n=10)
    assert result == [
        {"name": "Counterparty", "score": 0.9},
        {"name": "trades", "score": 0.5},
    ]


def test_format_page_rank_respects_top_n():
    rows = [{"nodeId": 1, "score": 0.1}, {"nodeId": 2, "score": 0.9}, {"nodeId": 3, "score": 0.5}]
    names = {1: "a", 2: "b", 3: "c"}
    result = format_page_rank(rows, names, top_n=1)
    assert result == [{"name": "b", "score": 0.9}]


def test_format_page_rank_never_fabricates_a_name_for_an_unresolved_id():
    result = format_page_rank([{"nodeId": 42, "score": 0.5}], {}, top_n=10)
    assert result == [{"name": "42", "score": 0.5}]


# ── format_communities ────────────────────────────────────────────


def test_format_communities_groups_real_members_by_real_community_id():
    rows = [
        {"nodeId": 1, "communityId": 0},
        {"nodeId": 2, "communityId": 1},
        {"nodeId": 3, "communityId": 0},
    ]
    names = {1: "trades", 2: "Counterparty", 3: "counterparties"}
    result = format_communities(rows, names)
    assert result == [
        {"community_id": 0, "members": ["trades", "counterparties"]},
        {"community_id": 1, "members": ["Counterparty"]},
    ]


def test_format_communities_never_merges_two_distinct_communities():
    rows = [{"nodeId": 1, "communityId": 5}, {"nodeId": 2, "communityId": 9}]
    names = {1: "a", 2: "b"}
    result = format_communities(rows, names)
    assert len(result) == 2
    assert {c["community_id"] for c in result} == {5, 9}


# ── format_similar_terms ──────────────────────────────────────────


def test_format_similar_terms_resolves_real_term_names_and_ranks_by_similarity():
    rows = [{"node1": 1, "node2": 2, "similarity": 0.6}, {"node1": 3, "node2": 4, "similarity": 0.95}]
    names = {1: "Trade", 2: "Trade Date", 3: "Counterparty", 4: "Counterparty Type"}
    result = format_similar_terms(rows, names, top_n=10)
    assert result == [
        {"term_a": "Counterparty", "term_b": "Counterparty Type", "similarity": 0.95},
        {"term_a": "Trade", "term_b": "Trade Date", "similarity": 0.6},
    ]


def test_format_similar_terms_respects_top_n():
    rows = [
        {"node1": 1, "node2": 2, "similarity": 0.1},
        {"node1": 3, "node2": 4, "similarity": 0.9},
    ]
    names = {1: "a", 2: "b", 3: "c", 4: "d"}
    result = format_similar_terms(rows, names, top_n=1)
    assert result == [{"term_a": "c", "term_b": "d", "similarity": 0.9}]
