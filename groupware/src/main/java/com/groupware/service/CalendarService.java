package com.groupware.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.groupware.dto.CalendarEventDTO;
import com.groupware.mapper.CalendarMapper;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class CalendarService {

    private final CalendarMapper calendarMapper;

    /**
     * 특정 연도/월 일정 목록 조회
     */
    public List<CalendarEventDTO> getEventsByYearAndMonth(int year, int month) {
        return calendarMapper.selectEventsByYearAndMonth(year, month);
    }

    /**
     * 새 일정 등록
     */
    public void insertEvent(CalendarEventDTO dto) {
        calendarMapper.insertEvent(dto);
    }

    /**
     * 일정 수정
     */
    public void updateEvent(CalendarEventDTO dto) {
        calendarMapper.updateEvent(dto);
    }

    /**
     * 일정 삭제
     */
    public void deleteEvent(int eventId) {
        calendarMapper.deleteEvent(eventId);
    }
}