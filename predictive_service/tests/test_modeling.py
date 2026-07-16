from datetime import datetime, timedelta, timezone

import pytest

from plantview_predictive.modeling import InsufficientDataError, build_pairs, predict, train_competition


def records(count=140, step_hours=4):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    result = []
    for index in range(count):
        flow = 80 + (index % 17)
        result.append({
            "timestampCreacion": (start + timedelta(hours=index * step_hours)).isoformat(),
            "cuPls": 2.1 + .006 * index + .02 * (index % 5),
            "flujoRiego": flow, "flujoRefino": 50 + index % 9,
            "nivelPiscinaPLS": 55 + .03 * index + .2 * (index % 7),
            "acido": 16 + index % 4, "mineral": 1200 + index % 23,
        })
    return result


@pytest.mark.parametrize("target,horizon", [("cu_pls", 4), ("cu_pls", 8), ("cu_pls", 12),
                                              ("cu_pls", 24), ("pool_pls", 24)])
def test_builds_all_required_horizons(target, horizon):
    x, y = build_pairs(records(), target, horizon)
    assert len(x) >= 130
    assert len(x) == len(y)


def test_competition_trains_and_artifact_inferrs():
    source = records()
    result = train_competition(source, "cu_pls", 4, minimum_pairs=100)
    assert result["winner"] in result["competition"]
    assert {"Linear Regression", "Random Forest", "Gradient Boosting", "Extra Trees"} <= set(result["competition"])
    try:
        import xgboost  # noqa: F401
        assert "XGBoost" in result["competition"]
    except ImportError:
        pass
    assert result["recordsUsed"] >= 100
    assert isinstance(predict(result["artifact"], source[-1]), float)


def test_insufficient_data_never_trains():
    with pytest.raises(InsufficientDataError, match="500 pares"):
        train_competition(records(20), "cu_pls", 4, minimum_pairs=500)
