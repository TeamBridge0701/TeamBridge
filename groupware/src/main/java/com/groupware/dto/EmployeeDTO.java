package com.groupware.dto;

import lombok.Data;

@Data
public class EmployeeDTO {
	private int employeeId;
	private String employeeNo; 		// 사번(로그인 ID 겸용)
	private String employeePwd;
	private String employeeName;
	private int deptId;
	private int positionId;
	private String employeeRole;	// EMPLOYEE / ADMIN
	private String employeePhone;
	private String employeeEmail;
	private String profileImg;
	private String employeeStatus;	// ACTIVE / SUSPENDED
	private String hireDate;
	private String createdAt;
	
	// 마이페이지에 사용할 필드
	private String deptName;		// 부서명
	private String positionName;	// 직급명
	private int positionRank;		// 서열 (팀장/부서장 여부 판단용)
}