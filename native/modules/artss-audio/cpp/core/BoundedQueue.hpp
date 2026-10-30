#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <type_traits>

namespace artss::audio {

// Bounded MPSC queue: UI and RN runtimes may produce; only RemoteIO consumes.
// The consumer never waits for a producer that has reserved but not published.
template <typename T, std::size_t Capacity>
class BoundedQueue final {
  static_assert(Capacity >= 2 && (Capacity & (Capacity - 1)) == 0);
  static_assert(std::is_trivially_copyable_v<T>);
  static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
  struct Cell {
    std::atomic<std::uint64_t> sequence{0};
    T value{};
  };

 public:
  BoundedQueue() noexcept {
    for (std::size_t i = 0; i < Capacity; ++i) {
      cells_[i].sequence.store(i, std::memory_order_relaxed);
    }
  }

  bool tryPush(const T& value) noexcept {
    auto position = enqueue_.load(std::memory_order_relaxed);
    for (int attempt = 0; attempt < 8; ++attempt) {
      auto& cell = cells_[position & (Capacity - 1)];
      const auto sequence = cell.sequence.load(std::memory_order_acquire);
      if (sequence < position) return false;
      if (sequence == position && enqueue_.compare_exchange_weak(
              position, position + 1, std::memory_order_relaxed)) {
        cell.value = value;
        cell.sequence.store(position + 1, std::memory_order_release);
        return true;
      }
      position = enqueue_.load(std::memory_order_relaxed);
    }
    return false;
  }

  bool tryPop(T& result) noexcept {
    auto& cell = cells_[dequeue_ & (Capacity - 1)];
    if (cell.sequence.load(std::memory_order_acquire) != dequeue_ + 1) {
      return false;
    }
    result = cell.value;
    cell.sequence.store(dequeue_ + Capacity, std::memory_order_release);
    ++dequeue_;
    return true;
  }

 private:
  std::array<Cell, Capacity> cells_{};
  alignas(64) std::atomic<std::uint64_t> enqueue_{0};
  alignas(64) std::uint64_t dequeue_{0};
};

}  // namespace artss::audio
