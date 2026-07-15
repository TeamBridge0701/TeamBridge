package com.groupware.service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.groupware.dto.AttendanceDTO;
import com.groupware.mapper.AttendanceMapper;

@Service
public class AttendanceService {
	
    private final AttendanceMapper attendanceMapper;

    public AttendanceService(AttendanceMapper attendanceMapper) {
        this.attendanceMapper = attendanceMapper;
    }
    //출근 정보 조회
    public AttendanceDTO getTodayAttendance(int employeeId, String today) {
        return attendanceMapper.selectTodayAttendance(employeeId, today);
    }
    
    //출근 처리 - 9시 넘으면 지각 처리
    @Transactional
    public void checkIn(int employeeId) {
        LocalDate today = LocalDate.now();
        String todayStr = today.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));

        if (attendanceMapper.selectTodayAttendance(employeeId, todayStr) != null) {
            throw new IllegalStateException("이미 오늘 출근 처리가 완료되었습니다.");
        }

        LocalTime nowTime = LocalTime.now();
        String status = nowTime.isAfter(LocalTime.of(9, 0, 0)) ? "LATE" : "NORMAL";
        String formattedTime = nowTime.format(DateTimeFormatter.ofPattern("HH:mm:ss"));

        attendanceMapper.insertCheckIn(employeeId, today, formattedTime, status);
    }

    //퇴근 처리 
    @Transactional
    public void checkOut(int employeeId) {
        LocalDate today = LocalDate.now();
        String todayStr = today.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        
        AttendanceDTO attendance = attendanceMapper.selectTodayAttendance(employeeId, todayStr);

        if (attendance == null) {
            throw new IllegalStateException("출근 기록이 없어 퇴근 처리가 불가능합니다.");
        }
        if (attendance.getCheckOutTime() != null) {
            throw new IllegalStateException("이미 오늘 퇴근 처리가 완료되었습니다.");
        }

        String formattedTime = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"));
        attendanceMapper.updateCheckOut(employeeId, today, formattedTime);
    }
}